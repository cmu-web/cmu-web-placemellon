// Builder: builds a PlaceMellon address from the form, with the same rules as
// the service (src/app.ts), and previews it from PM_BASE (docs.js). The page's
// own address keeps the form's options in the image address's terms (width,
// height, format, then the image's own options), so a builder link opens
// with the same image.
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
    questionOptions = $("pm-question-options"),
    color = $("pm-color"),
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
  // The bio placeholder starts at UCM's own size, 600 × 750, unless the size
  // has been typed in; back on another kind, the starting size returns
  var START = { w: width.value, h: height.value },
    BIO = { w: "600", h: "750" },
    sizeTyped = false,
    lastKind = null;
  [width, height].forEach(function (input) {
    input.addEventListener("input", function () {
      sizeTyped = true;
    });
  });
  function sizeFor(k) {
    if (sizeTyped || k === lastKind) return;
    var to = k === "bio" ? BIO : lastKind === "bio" ? START : null;
    if (to) {
      width.value = to.w;
      height.value = to.h;
    }
  }

  function kind() {
    return $("pm-kind").value;
  }
  // The Scotty bust's look: on white or on a gradient
  // The question mark's pose: recumbent (a play bow) or rampant (standing up)
  function pose() {
    return document.querySelector('input[name="pm-question-pose"]:checked').value;
  }
  // A solid color shows nothing, its width and height, or the wordmark
  function show() {
    return document.querySelector('input[name="pm-solid-show"]:checked').value;
  }
  function look() {
    return document.querySelector('input[name="pm-scotty-look"]:checked').value;
  }
  function size(input) {
    var v = input.value.trim();
    if (v === "") return "";
    return /^\d{1,4}$/.test(v) && +v >= 1 && +v <= 2048 ? +v : null;
  }
  function alt(k, c) {
    if (k === "solid") return color.options[color.selectedIndex].text + " placeholder";
    if (k === "profile") return "Placeholder profile picture of Scotty";
    if (k === "bio") return "Placeholder photo with the Carnegie Mellon wordmark";
    if (k === "bust") return "Placeholder graphic of Scotty's bust";
    if (k === "question") return "Scotty playing with a question mark";
    return c
      ? "Placeholder photo of Carnegie Mellon " + (c === "life" ? "student life" : c)
      : "Placeholder photo of Carnegie Mellon";
  }

  function update() {
    $("pm-kind-hint").textContent = $("pm-kind").selectedOptions[0].dataset.hint;
    var k = kind(),
      photo = k === "photo";
    sizeFor(k);
    lastKind = k;
    // Category and random choose photos; profile pictures are square
    // The photo choices show only under "CMU Photo", the looks under "Scotty
    // Graphic"
    photoOptions.hidden = !photo;
    solidOptions.hidden = k !== "solid";
    scottyOptions.hidden = k !== "bust";
    questionOptions.hidden = k !== "question";
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
    // Scotty's art is ?scotty=bust, profile, recumbent or rampant; the
    // question mark and gradient add to it
    if (k === "bust" || k === "profile") q.push("scotty=" + k);
    if (k === "bust" && look() === "gradient") q.push("gradient");
    if (k === "question") q.push("scotty=" + pose(), "question");
    // The bio placeholder is the wordmark on no color. The Builder never
    // writes ?bio: only Production Assets shows it, to count live sites.
    if (k === "bio") q.push("solid", "wordmark");
    if (k === "solid") q.push("solid");
    if (k === "solid" && show()) q.push(show());
    // Grayscale is a photo option; brand colors are a solid color's. The
    // wordmark with no color is the bio placeholder, so it always names one.
    if (photo && gray.checked) q.push("gray");
    if (k === "solid" && (color.value !== "iron-gray" || show() === "wordmark"))
      q.push("color=" + color.value);
    var qs = q.length ? "?" + q.join("&") : "";
    var state = ["width=" + w];
    if (h !== "") state.push("height=" + h);
    if (format.value !== types[0]) state.push("format=" + format.value);
    history.replaceState(null, "", "?" + state.concat(q).join("&"));

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
  // Options from the address, where they name something the form has, like
  // builder.html?category=labs from the Styles page
  var start = new URLSearchParams(location.search);
  [
    ["width", width],
    ["height", height],
  ].forEach(function (pair) {
    if (start.has(pair[0])) {
      pair[1].value = start.get(pair[0]);
      sizeTyped = true;
    }
  });
  // The image kind, by name. The wordmark with no color is the bio
  // placeholder; ?bio is the same.
  var scotty = start.get("scotty");
  if (scotty === "bust" || scotty === "profile") $("pm-kind").value = scotty;
  if (scotty === "recumbent" || scotty === "rampant") {
    $("pm-kind").value = "question";
    $("pm-question-" + scotty).checked = true;
  }
  if (start.has("solid")) $("pm-kind").value = "solid";
  if (start.has("bio") || (start.has("wordmark") && !start.has("color")))
    $("pm-kind").value = "bio";
  else if (start.has("wordmark")) $("pm-wordmark").checked = true;
  if (start.has("text")) $("pm-text").checked = true;
  [
    ["random", random],
    ["gray", gray],
  ].forEach(function (pair) {
    if (start.has(pair[0])) pair[1].checked = true;
  });
  if (start.has("gradient")) $("pm-scotty-gradient").checked = true;
  // ?category=any picks Any, since the form starts on Campus
  var wanted = start.get("category");
  if (wanted === "any") category.value = "";
  else if (wanted && category.querySelector('option[value="' + wanted + '"]'))
    category.value = wanted;
  wanted = start.get("color");
  if (wanted && color.querySelector('option[value="' + wanted + '"]')) color.value = wanted;
  wanted = start.get("format");
  if (wanted && format.querySelector('option[value="' + wanted + '"]')) format.value = wanted;
  update();
})();
