/* Cairn chat widget loader. Usage: <script src="https://YOUR-APP/widget.js" data-key="wk_..." async></script> */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute("data-key");
  if (!key || document.getElementById("cairn-widget-button")) return;
  var origin = new URL(script.src).origin;

  var button = document.createElement("button");
  button.id = "cairn-widget-button";
  button.type = "button";
  button.setAttribute("aria-label", "Open help chat");
  button.setAttribute("aria-expanded", "false");
  button.textContent = "?";
  button.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483646;width:56px;height:56px;border-radius:9999px;border:0;" +
    "background:#4338ca;color:#fff;font:600 24px/1 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);cursor:pointer";

  var frame = document.createElement("iframe");
  frame.title = "Help chat";
  frame.src = origin + "/embed/" + encodeURIComponent(key);
  frame.setAttribute("loading", "lazy");
  frame.style.cssText =
    "position:fixed;right:20px;bottom:88px;z-index:2147483647;width:380px;height:560px;max-width:calc(100vw - 40px);" +
    "max-height:calc(100vh - 120px);border:1px solid rgba(0,0,0,.12);border-radius:16px;background:#fff;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.25);display:none";

  button.addEventListener("click", function () {
    var open = frame.style.display === "none";
    frame.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close help chat" : "Open help chat");
    button.textContent = open ? "×" : "?";
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && frame.style.display !== "none") button.click();
  });
  document.body.appendChild(frame);
  document.body.appendChild(button);
})();
