export const ROUTES = {
  home: "/",
  questions: "/questions",
  photo: "/photo",
  geo: "/geo",
  settings: "/settings",
  admin: "/admin",
} as const;

export type RouteKey = keyof typeof ROUTES;




