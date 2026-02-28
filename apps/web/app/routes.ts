import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  layout("routes/auth-layout.tsx", [
    index("routes/home.tsx"),
    route("files/:id", "routes/file-detail.tsx"),
    route("search", "routes/search.tsx"),
    route("desktop", "routes/desktop.tsx"),
    route("api/upload", "routes/api.upload.tsx"),
    route("api/download", "routes/api.download.tsx"),
    route("api/share", "routes/api.share.tsx"),
    route("api/rerank", "routes/api.rerank.tsx"),
  ]),
  route("share/:token", "routes/share.$token.tsx"),
] satisfies RouteConfig;
