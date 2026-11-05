// Builder: builds a PlaceMellon address from the form, with the same rules as
// the service (src/app.ts), and previews it from PM_BASE (docs.js).
(function () {
  var $ = function (id) {
    return document.getElementById(id);
  };
  var width = $("pm-width"),
    height = $("pm-height"),
    category = $("pm-category"),
    random = $("pm-random"),
    gray = $("pm-gray"),
    photoOptions = $("pm-photo-options"),
    solidOptions = $("pm-solid-options"),
    scottyOptions = $("pm-scotty-options"),
    white = $("pm-white"),
    text = $("pm-text"),
    format = $("pm-format"),
    url = $("pm-url"),
    html = $("pm-html"),
    preview = $("pm-preview"),
    note = $("pm-preview-note"),
    another = $("pm-another"),
    anotherRow = $("pm-another-row"),
    sizeHint = $("pm-size-hint");
  var HINT = sizeHint.textContent,
    tries = 0;

  function kind() {
    return document.querySelector('input[name="pm-kind"]:checked').value;
  }
  function size(input) {
    var v = input.value.trim();
    if (v === "") return "";
    return /^\d{1,4}$/.test(v) && +v >= 1 && +v <= 2048 ? +v : null;
  }
  function alt(k, c) {
    if (k === "solid") return "Solid color placeholder";
    if (k === "profile") return "Placeholder profile picture of Scotty";
    if (k === "scotty") return "Placeholder image of Scotty";
    return c
      ? "Placeholder photo of Carnegie Mellon " + (c === "life" ? "student life" : c)
      : "Placeholder photo of Carnegie Mellon";
  }

  function update() {
    var k = kind(),
      photo = k === "photo";
    // Category and random choose photos; profile pictures are square
    // The photo choices show only under "A CMU Photo"
    photoOptions.hidden = !photo;
    solidOptions.hidden = k !== "solid";
    scottyOptions.hidden = k !== "scotty";
    gray.disabled = k === "solid";
    // Photos come as JPEG or WebP; drawn images as SVG or PNG
    var types = photo ? ["jpg", "webp"] : ["svg", "png"];
    Array.prototype.forEach.call(format.options, function (o) {
      o.hidden = types.indexOf(o.value) < 0;
    });
    if (types.indexOf(format.value) < 0) format.value = types[0];
    height.disabled = k === "profile";
    var w = size(width),
      h = k === "profile" ? "" : size(height);
    // The hint says what's wrong; aria-invalid marks which box
    width.setAttribute("aria-invalid", w === null || w === "" ? "true" : "false");
    height.setAttribute("aria-invalid", h === null ? "true" : "false");
    if (w === null || w === "" || h === null) {
      sizeHint.textContent = "Width and height must be whole numbers from 1 to 2048.";
      return;
    }
    sizeHint.textContent = HINT;

    // SVG and JPEG are the defaults, so only PNG and WebP add an extension
    var path =
      "/" +
      w +
      (h === "" || h === w ? "" : "/" + h) +
      (format.value === "png" || format.value === "webp" ? "." + format.value : "");
    var q = [];
    if (photo && category.value) q.push("category=" + category.value);
    if (photo && random.checked) q.push("random");
    if (!photo) q.push(k);
    if (k === "solid" && text.checked) q.push("text");
    if (k === "scotty" && white.checked) q.push("white");
    if (k !== "solid" && gray.checked) q.push("gray");
    var qs = q.length ? "?" + q.join("&") : "";

    url.textContent = PM_LIVE + path + qs;
    html.textContent =
      '<img src="' + PM_LIVE + path + qs + '" alt="' + alt(k, photo && category.value) + '">';

    // The same address shows the same image, so give random previews their own
    var previewQs = photo && random.checked ? qs.replace("random", "random=" + ++tries) : qs;
    preview.src = PM_BASE + path + previewQs;
    preview.width = w;
    preview.height = h === "" ? w : h;
    anotherRow.hidden = !(photo && random.checked);
    note.textContent = "Shown smaller to fit; the image is " + w + " by " + (h || w) + ".";
    fitNote();
  }

  // Only once the image has loaded, and only when the column really is
  // narrower than it.
  function fitNote() {
    note.hidden = !(
      preview.complete &&
      preview.naturalWidth &&
      preview.clientWidth < preview.naturalWidth
    );
  }
  preview.addEventListener("load", fitNote);
  window.addEventListener("resize", fitNote);

  document.getElementById("pm-builder").addEventListener("input", update);
  document.getElementById("pm-builder").addEventListener("submit", function (e) {
    e.preventDefault();
  });
  another.addEventListener("click", update);
  // builder.html?category=labs starts on that category (from the Options page)
  var start = new URLSearchParams(location.search).get("category");
  if (start && category.querySelector('option[value="' + start + '"]')) category.value = start;
  update();
})();
