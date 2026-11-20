import "./app.scss";
import App from "./App.svelte";

const target = document.getElementById("app");
if (target == null) {
  throw new Error("#app が見つかりません");
}

const app = new App({
  target,
});

export default app;
