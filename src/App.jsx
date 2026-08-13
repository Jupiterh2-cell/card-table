import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  shuffle,
  expandEntries,
  fileToResizedDataUrl,
  parseImportFile,
  newId,
  loadLibrary,
  saveDeck,
  deleteDeck,
} from "./deckUtils.js";
import { getRoom, setRoom, subscribeRoom, isFirebaseConfigured } from "./roomStore.js";

const emptyDeck = () => ({ id: newId(), name: "กองใหม่", entries: [] });

export default function App() {
  const [view, setView] = useState("library"); // library | editor | join | table
  const [library, setLibrary] = useState({});
  const [deck, setDeck] = useState(null); // deck being edited
  const [pendingDeckId, setPendingDeckId] = useState(null);

  const [quickName, setQuickName] = useState("");
  const [quickCount, setQuickCount] = useState(1);
  const [editingEntry, setEditingEntry] = useState(null); // entry object being edited, or null
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);
  const [importInfo, setImportInfo] = useState("");

  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsDeckPick, setNeedsDeckPick] = useState(false);

  const [roomState, setRoomState] = useState(null);
  const [hand, setHand] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showDeckPanel, setShowDeckPanel] = useState(false);
  const [flash, setFlash] = useState("");
  const unsubRef = useRef(null);

  useEffect(() => {
    setLibrary(loadLibrary());
  }, []);

  const flashMsg = (m) => {
    setFlash(m);
    setTimeout(() => setFlash(""), 1800);
  };

  // ---------- deck library ----------
  const openNewDeck = () => {
    setDeck(emptyDeck());
    setView("editor");
  };
  const openDeck = (id) => {
    setDeck(library[id]);
    setView("editor");
  };
  const removeDeck = (id) => {
    if (!confirm("ลบกองนี้ออกจากคลังเลยไหม?")) return;
    setLibrary(deleteDeck(id));
  };

  const quickAdd = () => {
    if (!quickName.trim()) return;
    const entry = { id: newId(), name: quickName.trim(), image: null, count: Math.max(1, quickCount) };
    setDeck((d) => ({ ...d, entries: [entry, ...d.entries] }));
    setQuickName("");
    setQuickCount(1);
  };

  const removeEntry = (id) => {
    setDeck((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
  };

  const saveEntryEdit = () => {
    setDeck((d) => ({
      ...d,
      entries: d.entries.map((e) => (e.id === editingEntry.id ? editingEntry : e)),
    }));
    setEditingEntry(null);
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const entries = parseImportFile(file.name, text);
      if (entries.length === 0) {
        setImportInfo("ไม่พบการ์ดในไฟล์นี้ ตรวจรูปแบบอีกครั้งนะ");
        return;
      }
      setDeck((d) => ({ ...d, entries: [...entries, ...d.entries] }));
      setImportInfo(`นำเข้าแล้ว ${entries.length} แบบ`);
      flashMsg(`นำเข้าการ์ด ${entries.length} แบบจากไฟล์`);
    } catch (e) {
      setImportInfo(e.message || "นำเข้าไฟล์ไม่สำเร็จ");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handleImagePick = async (file, targetSetter) => {
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      targetSetter(dataUrl);
    } catch (e) {
      flashMsg("อัปโหลดรูปไม่สำเร็จ");
    }
  };

  const saveDeckToLibrary = () => {
    if (!deck.name.trim()) return setError("ตั้งชื่อกองก่อนนะ");
    if (deck.entries.length === 0) return setError("เพิ่มการ์ดอย่างน้อย 1 ใบ");
    setError("");
    setLibrary(saveDeck(deck));
    setView("library");
  };

  const totalCards = (d) => d.entries.reduce((sum, e) => sum + e.count, 0);

  // ---------- room join / play ----------
  const goPlay = (deckId) => {
    setPendingDeckId(deckId);
    setView("join");
  };

  const fetchRoom = useCallback(async () => {
    if (!roomCode) return null;
    return getRoom(roomCode.trim().toUpperCase());
  }, [roomCode]);

  const startRoomFromDeck = async (chosenDeck) => {
    const cards = shuffle(expandEntries(chosenDeck.entries));
    const next = {
      deckName: chosenDeck.name,
      drawPile: cards.map((c) => c.id),
      cardData: Object.fromEntries(cards.map((c) => [c.id, { name: c.name, image: c.image }])),
      discardPile: [],
      updatedAt: Date.now(),
    };
    await setRoom(roomCode.trim().toUpperCase(), next);
    setRoomState(next);
    setView("table");
  };

  const handleJoin = async () => {
    setError("");
    if (!playerName.trim()) return setError("ใส่ชื่อผู้เล่นก่อนนะ");
    if (!roomCode.trim()) return setError("ใส่รหัสห้องก่อนนะ");
    setLoading(true);
    const existing = await fetchRoom();
    setLoading(false);
    if (existing) {
      setRoomState(existing);
      setView("table");
      return;
    }
    if (pendingDeckId && library[pendingDeckId]) {
      await startRoomFromDeck(library[pendingDeckId]);
      return;
    }
    setNeedsDeckPick(true);
  };

  useEffect(() => {
    if (view === "table" && roomCode) {
      unsubRef.current?.();
      unsubRef.current = subscribeRoom(roomCode.trim().toUpperCase(), setRoomState);
      return () => unsubRef.current?.();
    }
  }, [view, roomCode]);

  const draw = async () => {
    const code = roomCode.trim().toUpperCase();
    const latest = (await getRoom(code)) || roomState;
    if (!latest) return;
    if (latest.drawPile.length === 0) {
      flashMsg("กองจั่วหมดแล้ว — ลองสับกองทิ้งกลับ");
      return;
    }
    const id = latest.drawPile[0];
    const next = { ...latest, drawPile: latest.drawPile.slice(1), updatedAt: Date.now() };
    setHand((h) => [...h, { id, ...latest.cardData[id] }]);
    await setRoom(code, next);
    setRoomState(next);
    flashMsg(`จั่วได้: ${latest.cardData[id]?.name ?? ""}`);
  };

  const discardSelected = async () => {
    if (!selectedId) return flashMsg("แตะเลือกการ์ดในมือก่อน");
    const card = hand.find((c) => c.id === selectedId);
    if (!card) return;
    const code = roomCode.trim().toUpperCase();
    const latest = (await getRoom(code)) || roomState;
    const next = {
      ...latest,
      discardPile: [card.id, ...latest.discardPile],
      cardData: { ...latest.cardData, [card.id]: { name: card.name, image: card.image } },
      updatedAt: Date.now(),
    };
    setHand((h) => h.filter((c) => c.id !== selectedId));
    setSelectedId(null);
    await setRoom(code, next);
    setRoomState(next);
    flashMsg(`ทิ้ง: ${card.name}`);
  };

  const reshuffleDiscard = async () => {
    const code = roomCode.trim().toUpperCase();
    const latest = (await getRoom(code)) || roomState;
    if (!latest || latest.discardPile.length === 0) return flashMsg("ไม่มีการ์ดในกองทิ้ง");
    const next = {
      ...latest,
      drawPile: shuffle([...latest.drawPile, ...latest.discardPile]),
      discardPile: [],
      updatedAt: Date.now(),
    };
    await setRoom(code, next);
    setRoomState(next);
    flashMsg("สับกองทิ้งกลับเข้ากองจั่วแล้ว");
  };

  const leaveRoom = () => {
    unsubRef.current?.();
    setView("library");
    setHand([]);
    setRoomState(null);
    setSelectedId(null);
    setPendingDeckId(null);
    setNeedsDeckPick(false);
    setRoomCode("");
  };

  // ================= RENDER =================

  if (view === "library") {
    const decks = Object.values(library);
    return (
      <div className="ct-root">
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div className="ct-diamond" style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto 14px", border: "2px solid #c9a227" }} />
          <h1 className="ct-card-title" style={{ fontSize: 28, margin: 0 }}>โต๊ะการ์ด</h1>
          <p style={{ opacity: 0.7, fontSize: 13.5, marginTop: 6 }}>คลังกองการ์ดของคุณ</p>
          {!isFirebaseConfigured && (
            <p style={{ opacity: 0.55, fontSize: 11.5, marginTop: 4 }}>
              โหมด local-only (ยังไม่ตั้งค่า Firebase) — ดู README เพื่อเปิดซิงก์ข้ามเครื่อง
            </p>
          )}
        </div>

        <div className="ct-panel">
          <button className="ct-btn ct-btn-gold" style={{ width: "100%" }} onClick={openNewDeck}>
            + สร้างกองใหม่
          </button>

          {decks.length === 0 && (
            <p style={{ fontSize: 13, opacity: 0.6, marginTop: 16, textAlign: "center" }}>
              ยังไม่มีกองการ์ด — สร้างกองแรกของคุณได้เลย
            </p>
          )}

          {decks.map((d) => (
            <div key={d.id} className="ct-deckrow">
              <div>
                <div style={{ fontWeight: 700 }}>{d.name}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{totalCards(d)} ใบ · {d.entries.length} แบบ</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="ct-btn ct-btn-primary" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => goPlay(d.id)}>เล่น</button>
                <button className="ct-btn ct-btn-ghost" style={{ padding: "8px 10px", fontSize: 13, borderColor: "#1c2b2433", color: "#1c2b24" }} onClick={() => openDeck(d.id)}>แก้ไข</button>
                <button className="ct-btn ct-btn-ghost" style={{ padding: "8px 10px", fontSize: 13, borderColor: "#7a2e2e55", color: "#7a2e2e" }} onClick={() => removeDeck(d.id)}>ลบ</button>
              </div>
            </div>
          ))}
        </div>
        <button className="ct-btn ct-btn-primary" style={{ marginTop: 18 }} onClick={() => { setPendingDeckId(null); setView("join"); }}>
          เข้าห้องด้วยรหัส (ที่เพื่อนตั้งไว้แล้ว)
        </button>
      </div>
    );
  }

  if (view === "editor" && deck) {
    return (
      <div className="ct-root">
        <div className="ct-topbar">
          <span className="ct-chip">แก้ไขกอง</span>
          <button className="ct-btn ct-btn-ghost" onClick={() => setView("library")}>ย้อนกลับ</button>
        </div>
        <div className="ct-panel">
          <label className="ct-label">ชื่อกอง</label>
          <input className="ct-input" value={deck.name} onChange={(e) => setDeck({ ...deck, name: e.target.value })} />

          <label className="ct-label">เพิ่มการ์ดแบบไว</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              className="ct-input"
              style={{ flex: 1, marginTop: 0 }}
              placeholder="ข้อความ/ชื่อการ์ด"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && quickAdd()}
            />
            <input
              className="ct-input"
              type="number"
              min={1}
              style={{ width: 64, marginTop: 0 }}
              value={quickCount}
              onChange={(e) => setQuickCount(parseInt(e.target.value, 10) || 1)}
            />
            <button className="ct-btn ct-btn-gold" style={{ padding: "0 16px" }} onClick={quickAdd}>เพิ่ม</button>
          </div>

          <label className="ct-label">นำเข้าการ์ดจากไฟล์ (.txt / .csv / .json)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <input
              ref={importInputRef}
              type="file"
              accept=".txt,.csv,.json,text/plain,text/csv,application/json"
              style={{ fontSize: 12 }}
              onChange={(e) => handleImportFile(e.target.files?.[0])}
            />
          </div>
          {importInfo && <p style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>{importInfo}</p>}
          <p style={{ fontSize: 11.5, opacity: 0.55, marginTop: 4, lineHeight: 1.5 }}>
            .txt/.csv: บรรทัดละใบ เช่น <code>มัฟฟินไทม์,4</code> หรือ <code>พลุมัฟฟิน x 2</code><br />
            .json: <code>[{"{"}"name":"มัฟฟินไทม์","count":4,"image":"https://..."{"}"}]</code> (ใส่ image เป็น URL ได้ ไม่บังคับ)
          </p>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
            {deck.entries.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.55 }}>ยังไม่มีการ์ดในกองนี้ — พิมพ์ด้านบนแล้วกด "เพิ่ม"</p>
            )}
            {deck.entries.map((e) => (
              <div key={e.id} className="ct-entryrow">
                {e.image ? (
                  <img src={e.image} alt="" className="ct-thumb" />
                ) : (
                  <div className="ct-thumb ct-thumb-empty">🂠</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                  <div style={{ fontSize: 11.5, opacity: 0.6 }}>× {e.count}</div>
                </div>
                <button className="ct-iconbtn" onClick={() => setEditingEntry({ ...e })}>แก้ไข</button>
                <button className="ct-iconbtn ct-iconbtn-danger" onClick={() => removeEntry(e.id)}>ลบ</button>
              </div>
            ))}
          </div>

          {error && <div style={{ color: "#7a2e2e", fontSize: 13, marginTop: 10, fontWeight: 700 }}>{error}</div>}
          <button className="ct-btn ct-btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={saveDeckToLibrary}>
            บันทึกกอง
          </button>
        </div>

        {editingEntry && (
          <div className="ct-modal-backdrop" onClick={() => setEditingEntry(null)}>
            <div className="ct-panel" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
              <h3 className="ct-card-title" style={{ margin: "0 0 10px", fontSize: 18 }}>แก้ไขการ์ด</h3>

              <label className="ct-label">ข้อความบนการ์ด</label>
              <textarea
                className="ct-input"
                style={{ minHeight: 80 }}
                value={editingEntry.name}
                onChange={(e) => setEditingEntry({ ...editingEntry, name: e.target.value })}
              />

              <label className="ct-label">จำนวนใบ</label>
              <input
                className="ct-input"
                type="number"
                min={1}
                value={editingEntry.count}
                onChange={(e) => setEditingEntry({ ...editingEntry, count: parseInt(e.target.value, 10) || 1 })}
              />

              <label className="ct-label">รูปภาพ (ไม่บังคับ)</label>
              {editingEntry.image && (
                <div style={{ marginTop: 8 }}>
                  <img src={editingEntry.image} alt="" style={{ width: 100, borderRadius: 10 }} />
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ fontSize: 12 }}
                  onChange={(e) => handleImagePick(e.target.files?.[0], (url) => setEditingEntry((cur) => ({ ...cur, image: url })))}
                />
                {editingEntry.image && (
                  <button className="ct-iconbtn ct-iconbtn-danger" onClick={() => setEditingEntry({ ...editingEntry, image: null })}>
                    ลบรูป
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button className="ct-btn ct-btn-ghost" style={{ flex: 1, borderColor: "#1c2b2433", color: "#1c2b24" }} onClick={() => setEditingEntry(null)}>
                  ยกเลิก
                </button>
                <button className="ct-btn ct-btn-primary" style={{ flex: 1 }} onClick={saveEntryEdit}>
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === "join") {
    return (
      <div className="ct-root">
        <div className="ct-topbar">
          <span className="ct-chip">{pendingDeckId ? `เล่น: ${library[pendingDeckId]?.name}` : "เข้าห้อง"}</span>
          <button className="ct-btn ct-btn-ghost" onClick={() => setView("library")}>ย้อนกลับ</button>
        </div>
        <div className="ct-panel">
          <label className="ct-label">ชื่อของคุณ</label>
          <input className="ct-input" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="เช่น มูน" />
          <label className="ct-label">รหัสห้อง</label>
          <input
            className="ct-input"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ตั้งรหัสห้องแล้วบอกเพื่อน เช่น MUFFIN1"
          />
          {error && <div style={{ color: "#7a2e2e", fontSize: 13, marginTop: 10, fontWeight: 700 }}>{error}</div>}

          {needsDeckPick && (
            <div style={{ marginTop: 14 }}>
              <label className="ct-label">ห้องนี้ยังไม่มีกอง — เลือกจากคลัง</label>
              {Object.values(library).map((d) => (
                <div key={d.id} className="ct-preset" onClick={() => startRoomFromDeck(d)}>
                  {d.name} ({totalCards(d)} ใบ)
                </div>
              ))}
            </div>
          )}

          <button className="ct-btn ct-btn-primary" style={{ width: "100%", marginTop: 18 }} onClick={handleJoin} disabled={loading}>
            {loading ? "กำลังเชื่อมต่อ..." : "เข้าห้อง / สร้างห้อง"}
          </button>
        </div>
      </div>
    );
  }

  // table
  const drawCount = roomState?.drawPile?.length ?? 0;
  const discardCount = roomState?.discardPile?.length ?? 0;
  const topDiscardId = roomState?.discardPile?.[0];
  const topDiscard = topDiscardId ? roomState.cardData[topDiscardId] : null;

  return (
    <div className="ct-root">
      <div className="ct-topbar">
        <div className="ct-chip">ห้อง {roomCode}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ct-btn ct-btn-ghost" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => setShowDeckPanel((s) => !s)}>
            จัดการกอง
          </button>
          <button className="ct-btn ct-btn-ghost" style={{ padding: "8px 12px", fontSize: 13 }} onClick={leaveRoom}>
            ออกจากห้อง
          </button>
        </div>
      </div>

      {roomState?.deckName && <p style={{ fontSize: 12.5, opacity: 0.65, marginTop: -8, marginBottom: 14 }}>กอง: {roomState.deckName}</p>}

      {showDeckPanel && (
        <div className="ct-panel" style={{ marginBottom: 18 }}>
          <button className="ct-btn ct-btn-gold" onClick={reshuffleDiscard}>สับกองทิ้ง → กองจั่ว</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 22, alignItems: "center", justifyContent: "center", margin: "18px 0 28px" }}>
        <div style={{ textAlign: "center" }}>
          <div className="ct-pile ct-drawpile ct-diamond" onClick={draw} role="button" aria-label="จั่วการ์ด">
            <span className="ct-pile-count">{drawCount}</span>
          </div>
          <p style={{ fontSize: 12, marginTop: 8, opacity: 0.75 }}>กองจั่ว — แตะเพื่อจั่ว</p>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="ct-pile ct-discardpile">
            {topDiscard ? (
              topDiscard.image ? (
                <img src={topDiscard.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }} />
              ) : (
                <span style={{ fontSize: 12, fontWeight: 700, padding: 6 }}>{topDiscard.name}</span>
              )
            ) : (
              <span style={{ fontSize: 11, opacity: 0.5 }}>ว่าง</span>
            )}
            <span className="ct-pile-count">{discardCount}</span>
          </div>
          <p style={{ fontSize: 12, marginTop: 8, opacity: 0.75 }}>กองทิ้ง</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 26 }}>
        <button className="ct-btn ct-btn-gold" onClick={draw} disabled={drawCount === 0}>จั่วการ์ด</button>
        <button className="ct-btn ct-btn-primary" onClick={discardSelected} disabled={!selectedId}>ทิ้งการ์ดที่เลือก</button>
      </div>

      <div style={{ width: "100%", maxWidth: 640 }}>
        <p style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 8 }}>มือของ {playerName || "คุณ"} ({hand.length} ใบ) — เห็นเฉพาะคุณ</p>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 10 }}>
          {hand.length === 0 && <div style={{ fontSize: 12.5, opacity: 0.5, padding: "20px 4px" }}>ยังไม่มีการ์ดในมือ — ลองจั่วดูสิ</div>}
          {hand.map((c) => (
            <div key={c.id} className={`ct-hand-card ${selectedId === c.id ? "selected" : ""}`} onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}>
              {c.image ? <img src={c.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 9 }} /> : c.name}
            </div>
          ))}
        </div>
      </div>

      {flash && <div className="ct-toast">{flash}</div>}
    </div>
  );
}
