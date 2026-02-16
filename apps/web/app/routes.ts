import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("files/:id", "routes/file-detail.tsx"),
  route("search", "routes/search.tsx"),
  route("share/:token", "routes/share.$token.tsx"),
  route("desktop", "routes/desktop.tsx"),
] satisfies RouteConfig;

