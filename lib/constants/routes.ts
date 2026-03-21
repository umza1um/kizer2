export const ROUTES = {
  home: "/",
  questions: "/questions",
  photo: "/photo",
  photoV2: "/photo-v2",
  geo: "/geo",
  settings: "/settings",
  admin: "/admin",
} as const;

export type RouteKey = keyof typeof ROUTES;




