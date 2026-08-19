//! Maqsad tili — faqat o'zbekcha.
//!
//! Ingliz va rus matni avtomatik o'zbekchaga tarjima qilinadi.
//! Boshqa tillar qo'llab-quvvatlanmaydi.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Language {
    pub code: &'static str,
    /// Promptga qo'yiladigan inglizcha nom.
    pub name: &'static str,
    /// Tanlash ro'yxatida ko'rsatiladigan nom.
    pub native_name: &'static str,
}

pub const LANGUAGES: &[Language] = &[Language {
    code: "uz",
    name: "Uzbek",
    native_name: "O'zbek",
}];

pub fn name_for(code: &str) -> &'static str {
    LANGUAGES
        .iter()
        .find(|language| language.code == code)
        .map(|language| language.name)
        .unwrap_or("Uzbek")
}
