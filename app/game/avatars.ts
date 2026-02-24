export type CardTheme = {
  frontStart: string;
  frontEnd: string;
  backStart: string;
  backEnd: string;
  accent: string;
  ink: string;
};

export type Avatar = {
  id: string;
  label: string;
  emoji: string;
  bg: string;
  fg: string;
  card: CardTheme;
};

export const AVATARS: Avatar[] = [
  {
    id: "rose",
    label: "Rose",
    emoji: "\u{1F339}",
    bg: "#f2d7bf",
    fg: "#8b2f3a",
    card: {
      frontStart: "#f9f2e7",
      frontEnd: "#ead1c2",
      backStart: "#2a1a16",
      backEnd: "#4a2a24",
      accent: "#a23643",
      ink: "#3a1d1d",
    },
  },
  {
    id: "skull",
    label: "Skull",
    emoji: "\u{1F480}",
    bg: "#d7d7d7",
    fg: "#2b2b2b",
    card: {
      frontStart: "#f1f1f1",
      frontEnd: "#d7d7d7",
      backStart: "#1c1c1c",
      backEnd: "#3a3a3a",
      accent: "#3c3c3c",
      ink: "#1d1d1d",
    },
  },
  {
    id: "crown",
    label: "Crown",
    emoji: "\u{1F451}",
    bg: "#f5d37e",
    fg: "#7a4c12",
    card: {
      frontStart: "#fff2c7",
      frontEnd: "#f1c873",
      backStart: "#3f2a12",
      backEnd: "#6b461b",
      accent: "#c7872d",
      ink: "#5a3a0f",
    },
  },
  {
    id: "mask",
    label: "Mask",
    emoji: "\u{1F3AD}",
    bg: "#a8d0cc",
    fg: "#1f5e5b",
    card: {
      frontStart: "#e2f2f1",
      frontEnd: "#b7dad6",
      backStart: "#1b3a3a",
      backEnd: "#2d5b5a",
      accent: "#2c8078",
      ink: "#1f4d49",
    },
  },
  {
    id: "dagger",
    label: "Dagger",
    emoji: "\u{1F5E1}\u{FE0F}",
    bg: "#d4b7a7",
    fg: "#5a2d26",
    card: {
      frontStart: "#f3e4dc",
      frontEnd: "#d7b8a6",
      backStart: "#331c19",
      backEnd: "#5a2d26",
      accent: "#8b3c33",
      ink: "#4a241e",
    },
  },
  {
    id: "lantern",
    label: "Lantern",
    emoji: "\u{1F3EE}",
    bg: "#f4c69f",
    fg: "#8c4a22",
    card: {
      frontStart: "#ffe6cf",
      frontEnd: "#f2c08b",
      backStart: "#3d2414",
      backEnd: "#6b3a1f",
      accent: "#c26428",
      ink: "#6a3518",
    },
  },
  {
    id: "owl",
    label: "Owl",
    emoji: "\u{1F989}",
    bg: "#c3d7b6",
    fg: "#2f5032",
    card: {
      frontStart: "#eef5e7",
      frontEnd: "#c8dcb9",
      backStart: "#1f3523",
      backEnd: "#39553b",
      accent: "#5c874e",
      ink: "#2f4a2f",
    },
  },
  {
    id: "moon",
    label: "Moon",
    emoji: "\u{1F319}",
    bg: "#cdd1f5",
    fg: "#30386b",
    card: {
      frontStart: "#edf0ff",
      frontEnd: "#c5c9ef",
      backStart: "#202640",
      backEnd: "#38406b",
      accent: "#5360a8",
      ink: "#2e3561",
    },
  },
  {
    id: "sun",
    label: "Sun",
    emoji: "\u{2600}\u{FE0F}",
    bg: "#f8d89a",
    fg: "#7a4b13",
    card: {
      frontStart: "#fff1c7",
      frontEnd: "#f4cf7a",
      backStart: "#3f2a10",
      backEnd: "#6a4015",
      accent: "#d38b2c",
      ink: "#6b3f12",
    },
  },
  {
    id: "wave",
    label: "Wave",
    emoji: "\u{1F30A}",
    bg: "#a7d6f3",
    fg: "#235a8c",
    card: {
      frontStart: "#e0f4ff",
      frontEnd: "#a6d5f1",
      backStart: "#16314b",
      backEnd: "#254f78",
      accent: "#2d7fb2",
      ink: "#1e4b74",
    },
  },
  {
    id: "flame",
    label: "Flame",
    emoji: "\u{1F525}",
    bg: "#f6b09c",
    fg: "#7a2a1a",
    card: {
      frontStart: "#ffe0d6",
      frontEnd: "#f2b09a",
      backStart: "#3f1e17",
      backEnd: "#6b2f23",
      accent: "#c24c2f",
      ink: "#6b281a",
    },
  },
  {
    id: "peacock",
    label: "Peacock",
    emoji: "\u{1F99A}",
    bg: "#b0dfd4",
    fg: "#1f4f4a",
    card: {
      frontStart: "#e6f6f1",
      frontEnd: "#b7e0d6",
      backStart: "#173532",
      backEnd: "#2f5b57",
      accent: "#2d8c7f",
      ink: "#1f4f4a",
    },
  },
];

export const DEFAULT_AVATAR_ID = AVATARS[0].id;

export const getAvatarById = (id: string) =>
  AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
