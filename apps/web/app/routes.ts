import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  layout("routes/auth-layout.tsx", [
    index("routes/home.tsx"),
    route("files/:id", "routes/file-detail.tsx"),
    route("search", "routes/search.tsx"),
    route("desktop", "routes/desktop.tsx"),
  ]),
  route("share/:token", "routes/share.$token.tsx"),
] satisfies RouteConfig;
