type Res = {
  status: (code: number) => Res
  json: (body: unknown) => void
}

export default function handler(_req: unknown, res: Res) {
  res.status(200).json({ native: false })
}
