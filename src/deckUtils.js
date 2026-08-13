// ---------- generic card/deck helpers ----------
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// entries: [{id, name, image, count}]
export function expandEntries(entries) {
  const cards = [];
  entries.forEach((entry) => {
    for (let i = 0; i < entry.count; i++) {
      cards.push({
        id: `${entry.id}_${i}`,
        name: entry.name,
        image: entry.image || null,
      });
    }
  });
  return cards;
}

// Resize + compress an uploaded image so it stays small in storage.
export function fileToResizedDataUrl(file, maxDim = 320, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("โหลดรูปไม่สำเร็จ"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- bulk import from a .txt/.csv/.json file ----------
// Returns an array of {id, name, image, count} ready to merge into a deck.
// .txt/.csv: one card per line, formats supported:
//   ชื่อการ์ด,จำนวน
//   ชื่อการ์ด x จำนวน
//   ชื่อการ์ด            (defaults to count 1)
// .json: an array of objects, e.g.
//   [{ "name": "มัฟฟินไทม์", "count": 4, "image": "https://..." }, ...]
export function parseImportFile(filename, text) {
  const isJson = /\.json$/i.test(filename) || text.trim().startsWith("[");
  if (isJson) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("ไฟล์ JSON รูปแบบไม่ถูกต้อง");
    }
    if (!Array.isArray(data)) throw new Error("ไฟล์ JSON ต้องเป็น array ของการ์ด");
    return data
      .map((item) => ({
        id: newId(),
        name: String(item.name ?? item.text ?? "").trim(),
        image: item.image || null,
        count: Math.max(1, parseInt(item.count, 10) || 1),
      }))
      .filter((e) => e.name);
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      let name = line;
      let count = 1;
      if (line.includes(",")) {
        const parts = line.split(",");
        name = parts[0].trim();
        const n = parseInt(parts[1], 10);
        if (!isNaN(n)) count = n;
      } else {
        const m = line.match(/^(.*?)[xX×]\s*(\d+)\s*$/);
        if (m) {
          name = m[1].trim();
          count = parseInt(m[2], 10);
        }
      }
      return { id: newId(), name: name.trim(), image: null, count: Math.max(1, count) };
    })
    .filter((e) => e.name);
}

// ---------- personal deck library (device-local) ----------
const LIB_KEY = "cardtable_deck_library";

export function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLibrary(lib) {
  localStorage.setItem(LIB_KEY, JSON.stringify(lib));
}

// deck: { id, name, entries: [{id, name, image, count}] }
export function saveDeck(deck) {
  const lib = loadLibrary();
  lib[deck.id] = deck;
  saveLibrary(lib);
  return lib;
}

export function deleteDeck(deckId) {
  const lib = loadLibrary();
  delete lib[deckId];
  saveLibrary(lib);
  return lib;
      }
