export const modeInfo = {
  design: {
    name: "声音设计",
    en: "Voice Design",
    icon: "Sparkles",
    description: "用文字描绘你想象中的声音，让每一种表达，都恰到好处。",
  },
  clone: {
    name: "声音克隆",
    en: "Voice Clone",
    icon: "AudioLines",
    description: "从一段熟悉的声音开始，让新的文字延续同样的声线。",
  },
  direction: {
    name: "声音指导",
    en: "Voice Direction",
    icon: "SlidersHorizontal",
    description: "保留声音的独特质感，为每一句话赋予新的情绪与表达。",
  },
};
export const designPresets = [
  {
    id: "warm",
    name: "温柔女声",
    en: "Warm & gentle",
    icon: "Flower2",
    color: "peach",
    zh: "一位温柔自信的年轻女性，声音清晰，语气亲切，表达轻快而富有感染力。",
    english:
      "A warm, confident young woman with a clear voice, a friendly tone, and a light, engaging delivery.",
  },
  {
    id: "narrator",
    name: "沉稳男声",
    en: "Calm & grounded",
    icon: "Mic2",
    color: "blue",
    zh: "一位成熟稳重的男性，声音低沉醇厚，以平静自然的语气娓娓道来。",
    english:
      "A mature man with a deep, rich voice, speaking naturally and calmly with a grounded, thoughtful delivery.",
  },
  {
    id: "story",
    name: "故事旁白",
    en: "Storytelling",
    icon: "BookOpen",
    color: "purple",
    zh: "一位富有故事感的旁白，声音温暖细腻，节奏舒缓，带着恰到好处的情感起伏。",
    english:
      "A warm, nuanced storyteller with an unhurried pace and subtle emotional variation.",
  },
  {
    id: "bright",
    name: "活力青年",
    en: "Bright & lively",
    icon: "Sun",
    color: "yellow",
    zh: "一位充满活力的年轻人，声音明亮，语气轻松愉快，表达自然、有朝气。",
    english:
      "An energetic young adult with a bright voice, an upbeat, relaxed tone, and a natural, lively delivery.",
  },
  {
    id: "broadcast",
    name: "专业播音",
    en: "Clear & composed",
    icon: "Radio",
    color: "green",
    zh: "一位专业播音员，吐字清晰，声音饱满，以自信、从容且富有节奏的方式表达。",
    english:
      "A professional presenter with crisp diction and a full voice, speaking confidently with a composed, rhythmic delivery.",
  },
  {
    id: "soft",
    name: "轻声耳语",
    en: "Soft & intimate",
    icon: "Moon",
    color: "pink",
    zh: "用轻柔的气声低声说话，声音细腻、贴近，节奏缓慢，营造安静放松的氛围。",
    english:
      "A soft, intimate whisper with a delicate, breathy voice and a slow, relaxing pace.",
  },
];
export const directionPresets = [
  {
    id: "gentle",
    name: "温柔",
    en: "Gentle",
    icon: "Flower2",
    color: "peach",
    zh: "用温柔、亲切的语气说话。",
    english: "Speak in a gentle, warm, and friendly tone.",
  },
  {
    id: "serious",
    name: "严肃",
    en: "Serious",
    icon: "Mic2",
    color: "blue",
    zh: "以克制、严肃的语气表达。",
    english: "Speak with a restrained, serious tone.",
  },
  {
    id: "excited",
    name: "兴奋",
    en: "Excited",
    icon: "Sun",
    color: "yellow",
    zh: "用兴奋且富有活力的方式表达。",
    english: "Speak with excitement and vibrant energy.",
  },
  {
    id: "sad",
    name: "悲伤",
    en: "Melancholic",
    icon: "Cloud",
    color: "purple",
    zh: "以低沉、略带悲伤的语气说话。",
    english: "Speak in a low, slightly sorrowful tone.",
  },
  {
    id: "slow",
    name: "缓慢",
    en: "Unhurried",
    icon: "Waves",
    color: "green",
    zh: "放慢表达节奏，清晰地说出每个词。",
    english: "Slow down and pronounce every word clearly.",
  },
  {
    id: "natural",
    name: "自然",
    en: "Natural",
    icon: "Coffee",
    color: "pink",
    zh: "使用轻松自然的日常交流语气。",
    english: "Use a relaxed, natural everyday conversational tone.",
  },
];
export const sampleText = {
  zh: "每一个平凡的日子，都藏着值得被听见的故事。\n让我们放慢脚步，听一听风的声音，也听一听自己内心的回响。",
  en: "Every ordinary day holds a story worth hearing.\nLet us slow down, listen to the breeze, and discover the echoes within ourselves.",
};
export const eventTags = [
  { zh: "笑", en: "laugh", icon: "Smile" },
  { zh: "咳嗽", en: "cough", icon: "AudioLines" },
  { zh: "清嗓子", en: "clears throat", icon: "Mic2" },
  { zh: "叹气", en: "sigh", icon: "Wind" },
];
export const formatTime = (value) => {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};
export const formatDate = (value) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
