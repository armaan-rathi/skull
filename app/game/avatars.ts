export type Avatar = {
  id: string;
  label: string;
  emoji: string;
  bg: string;
  fg: string;
};

export const AVATARS: Avatar[] = [
  {
    id: "rose",
    label: "Rose",
    emoji: "\u{1F339}",
    bg: "#f2d7bf",
    fg: "#8b2f3a",
  },
  {
    id: "skull",
    label: "Skull",
    emoji: "\u{1F480}",
    bg: "#d7d7d7",
    fg: "#2b2b2b",
  },
  {
    id: "crown",
    label: "Crown",
    emoji: "\u{1F451}",
    bg: "#f5d37e",
    fg: "#7a4c12",
  },
  {
    id: "mask",
    label: "Mask",
    emoji: "\u{1F3AD}",
    bg: "#a8d0cc",
    fg: "#1f5e5b",
  },
  {
    id: "dagger",
    label: "Dagger",
    emoji: "\u{1F5E1}\u{FE0F}",
    bg: "#d4b7a7",
    fg: "#5a2d26",
  },
  {
    id: "lantern",
    label: "Lantern",
    emoji: "\u{1F3EE}",
    bg: "#f4c69f",
    fg: "#8c4a22",
  },
  {
    id: "owl",
    label: "Owl",
    emoji: "\u{1F989}",
    bg: "#c3d7b6",
    fg: "#2f5032",
  },
  {
    id: "throne",
    label: "Throne",
    emoji: "\u{1FA91}",
    bg: "#b9c7e5",
    fg: "#2d3b66",
  },
];

export const DEFAULT_AVATAR_ID = AVATARS[0].id;

export const getAvatarById = (id: string) =>
  AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
