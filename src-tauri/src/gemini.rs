use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TranslatePayload {
    pub original: String,
    pub translation: String,
    pub note: String,
}

/// Ko'rsatma inglizcha — global modellar inglizcha promptga barqarorroq javob beradi.
/// Manba: ingliz yoki rus; natija har doim o'zbekcha (lotin yozuvi).
const PROMPT: &str = "The screenshot contains game text in English or Russian.
Translate that text into Uzbek using Latin script (o'zbekcha).
If there is no readable English or Russian text, return empty arrays.
Keep every line and its layout. Do not merge lines. Leave proper names unchanged.
Reply with JSON only: {\"original\":[\"line 1\"],\"translation\":[\"line 1\"],\"note\":\"...\"}
note: do not repeat the translation. In 1-2 sentences, written in Uzbek, explain what this text is in the game (for example a quest, a warning, an item description, dialogue).";

fn build_prompt(_target_language: &str) -> String {
    PROMPT.to_string()
}

const FAST_MODELS: [&str; 2] = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RouteKind {
    Google,
    Interactions,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Route {
    kind: RouteKind,
    model: String,
}

/// Muvaffaqiyatli marshrut eslab qolinadi — keyingi so'rovlar darhol o'sha yo'ldan ketadi.
static CACHED_ROUTE: Mutex<Option<Route>> = Mutex::new(None);

pub fn clean_key(value: &str) -> String {
    let mut key = value.trim_start_matches('\u{feff}').trim().to_string();
    if let Some(rest) = key
        .strip_prefix("GEMINI_API_KEY")
        .map(|r| r.trim_start().strip_prefix('=').unwrap_or(r))
    {
        key = rest.trim().to_string();
    }
    key.trim_matches(|c| c == '"' || c == '\'').trim().to_string()
}

/// Model `original`/`translation` ni massiv yoki satr sifatida qaytarishi mumkin.
fn as_lines(value: Option<&Value>) -> String {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| match item {
                Value::String(s) => s.trim_end().to_string(),
                Value::Null => String::new(),
                other => other.to_string(),
            })
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string(),
        Some(Value::String(text)) => text.replace("\r\n", "\n").replace("\\n", "\n").trim().to_string(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

fn extract_json(text: &str) -> Result<TranslatePayload, String> {
    let trimmed = text.trim();
    let start = trimmed.find('{');
    let end = trimmed.rfind('}');
    let raw = match (start, end) {
        (Some(s), Some(e)) if e > s => &trimmed[s..=e],
        _ => trimmed,
    };

    let parsed: Value = serde_json::from_str(raw).map_err(|err| {
        log::warn!("AI javobi JSON emas: {err}");
        "BAD_RESPONSE".to_string()
    })?;

    Ok(TranslatePayload {
        original: as_lines(parsed.get("original")),
        translation: as_lines(parsed.get("translation")),
        note: as_lines(parsed.get("note"))
            .split('\n')
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join(" "),
    })
}

fn response_text(body: &Value) -> String {
    if let Some(text) = body.get("output_text").and_then(Value::as_str) {
        if !text.trim().is_empty() {
            return text.to_string();
        }
    }

    let mut parts = String::new();
    if let Some(steps) = body.get("steps").and_then(Value::as_array) {
        for step in steps {
            if step.get("type").and_then(Value::as_str) == Some("thought") {
                continue;
            }
            if let Some(content) = step.get("content").and_then(Value::as_array) {
                for item in content {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        parts.push_str(text);
                    }
                }
            }
        }
    }
    if !parts.is_empty() {
        return parts;
    }

    body.get("candidates")
        .and_then(Value::as_array)
        .and_then(|list| list.first())
        .and_then(|item| item.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
}

fn error_message(body: &Value, status: u16) -> String {
    body.get("error")
        .and_then(|err| err.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|msg| !msg.trim().is_empty())
        .unwrap_or_else(|| format!("HTTP {status}"))
}

async fn post_json(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    payload: Value,
    extra_headers: &[(&str, &str)],
) -> Result<TranslatePayload, String> {
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key);
    for (name, value) in extra_headers {
        request = request.header(*name, *value);
    }

    let response = request.json(&payload).send().await.map_err(|err| {
        log::warn!("Gemini so'rovi yuborilmadi: {err}");
        "NETWORK_ERROR".to_string()
    })?;

    let status = response.status();
    let raw = response.text().await.map_err(|err| {
        log::warn!("Gemini javobi o'qilmadi: {err}");
        "NETWORK_ERROR".to_string()
    })?;

    let body: Value = if raw.trim().is_empty() {
        Value::Object(Default::default())
    } else {
        serde_json::from_str(&raw).unwrap_or_else(|_| {
            json!({ "error": { "message": raw.chars().take(280).collect::<String>() } })
        })
    };

    if !status.is_success() {
        return Err(error_message(&body, status.as_u16()));
    }

    let text = response_text(&body);
    if text.trim().is_empty() {
        return Err("EMPTY_RESPONSE".to_string());
    }
    extract_json(&text)
}

async fn call_route(
    client: &reqwest::Client,
    route: &Route,
    api_key: &str,
    prompt: &str,
    base64_image: &str,
) -> Result<TranslatePayload, String> {
    match route.kind {
        RouteKind::Interactions => {
            post_json(
                client,
                "https://generativelanguage.googleapis.com/v1beta/interactions",
                api_key,
                json!({
                    "model": route.model,
                    "input": [
                        { "type": "text", "text": prompt },
                        { "type": "image", "data": base64_image, "mime_type": "image/jpeg" }
                    ],
                    "generation_config": {
                        "max_output_tokens": 400,
                        "thinking_level": "minimal",
                        "thinking_summaries": "none"
                    }
                }),
                &[("Api-Revision", "2026-05-20")],
            )
            .await
        }
        RouteKind::Google => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
                route.model
            );
            post_json(
                client,
                &url,
                api_key,
                json!({
                    "contents": [{
                        "parts": [
                            { "text": prompt },
                            { "inlineData": { "mimeType": "image/jpeg", "data": base64_image } }
                        ]
                    }],
                    "generationConfig": {
                        "temperature": 0,
                        "maxOutputTokens": 400,
                        "responseMimeType": "application/json",
                        "thinkingConfig": { "thinkingBudget": 0, "thinkingLevel": "MINIMAL" }
                    }
                }),
                &[],
            )
            .await
        }
    }
}

fn candidate_routes() -> Vec<Route> {
    let mut routes = Vec::new();
    if let Some(cached) = CACHED_ROUTE.lock().ok().and_then(|guard| guard.clone()) {
        routes.push(cached);
    }
    for model in FAST_MODELS {
        routes.push(Route { kind: RouteKind::Google, model: model.to_string() });
        routes.push(Route { kind: RouteKind::Interactions, model: model.to_string() });
    }
    routes.dedup();
    routes
}

/// `data:image/jpeg;base64,...` yoki toza base64 qabul qiladi.
pub fn strip_data_url(data_url: &str) -> &str {
    match data_url.find(',') {
        Some(index) => &data_url[index + 1..],
        None => data_url,
    }
}

pub async fn translate(
    api_key: &str,
    target_language: &str,
    data_url: &str,
) -> Result<TranslatePayload, String> {
    let key = clean_key(api_key);
    if key.is_empty() {
        return Err("MISSING_API_KEY".to_string());
    }

    let base64_image = strip_data_url(data_url);
    if base64_image.trim().is_empty() {
        return Err("NO_IMAGE".to_string());
    }

    let prompt = build_prompt(target_language);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|err| {
            log::warn!("HTTP klient yaratilmadi: {err}");
            "NETWORK_ERROR".to_string()
        })?;

    let mut seen: Vec<Route> = Vec::new();
    let mut last_error = "TRANSLATE_FAILED".to_string();

    for route in candidate_routes() {
        if seen.contains(&route) {
            continue;
        }
        seen.push(route.clone());

        match call_route(&client, &route, &key, &prompt, base64_image).await {
            Ok(payload) => {
                if let Ok(mut guard) = CACHED_ROUTE.lock() {
                    *guard = Some(route);
                }
                return Ok(payload);
            }
            Err(err) => {
                let lowered = err.to_lowercase();
                if lowered.contains("quota") || lowered.contains("rate limit") {
                    return Err("QUOTA_EXCEEDED".to_string());
                }
                if lowered.contains("invalid authentication")
                    || lowered.contains("unauthenticated")
                    || lowered.contains("api key not valid")
                    || lowered.contains("api_key_invalid")
                {
                    return Err("INVALID_API_KEY".to_string());
                }
                // Ishlamagan marshrut kesh'da qolib qolmasin.
                if let Ok(mut guard) = CACHED_ROUTE.lock() {
                    if guard.as_ref() == Some(&route) {
                        *guard = None;
                    }
                }
                last_error = err;
            }
        }
    }

    Err(last_error)
}
