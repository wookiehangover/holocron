import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("share/:token", "routes/share.$token.tsx"),
] satisfies RouteConfig;

