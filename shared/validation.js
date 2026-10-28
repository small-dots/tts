export const MODES = ["design", "clone", "direction"];
export function validateSpeech(fields, hasAudio) {
  if (!MODES.includes(fields.mode)) return "请选择有效的生成模式";
  if (typeof fields.text !== "string" || !fields.text.trim())
    return "请输入待生成的语音文本";
  if (fields.text.length > 10000) return "语音文本不能超过 10,000 字符";
  if (fields.mode !== "clone") {
    if (typeof fields.instruction !== "string" || !fields.instruction.trim())
      return fields.mode === "design" ? "请填写声音描述" : "请填写声音指导";
    if (fields.instruction.length > 3000) return "声音描述不能超过 3,000 字符";
    if (
      fields.cfg_scale !== undefined &&
      fields.cfg_scale !== "" &&
      (!Number.isFinite(Number(fields.cfg_scale)) ||
        Number(fields.cfg_scale) <= 0 ||
        Number(fields.cfg_scale) > 20)
    )
      return "CFG Scale 需要在 0 到 20 之间（不含 0）";
  }
  if (fields.mode !== "design") {
    if (!hasAudio) return "请上传有效的 WAV 参考音频";
    if (typeof fields.ref_text !== "string" || !fields.ref_text.trim())
      return "请填写与参考音频一致的准确文字稿";
    if (fields.ref_text.length > 10000) return "参考文字稿不能超过 10,000 字符";
    if (fields.authorized !== "true" && fields.authorized !== true)
      return "请确认拥有该声音的使用授权";
  }
  if (
    fields.seed !== "" &&
    fields.seed !== undefined &&
    (!/^\d+$/.test(String(fields.seed)) ||
      !Number.isSafeInteger(Number(fields.seed)) ||
      Number(fields.seed) > 2147483647)
  )
    return "Seed 需要是 0 到 2,147,483,647 之间的整数";
  return null;
}
