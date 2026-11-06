// ============================================================
// ボタンの動きと、AI生成の呼び出し
// 文章を直したいときは scenarios.js、見た目は style.css を直す
// ============================================================

// ---- 調整用の数字 ----
const TIMEOUT_MS = 0;       // 1回の生成で待つ最大時間。0 = 結果が出るまで待つ（例：10000 にすると10秒で打ち切り）
const MAX_TRIES = 1;        // 生成の回数。1 = 作り直さない（実在の名前が混ざったらすぐサンプル）。3 にすると合計3回まで作り直す
const FLIP_GAP_MS = 700;    // カードが1枚ずつ裏返る間隔
const PLACES = ["cafe", "station", "school", "home"];

// ---- 画面の部品 ----
const $ = (id) => document.getElementById(id);
const eraseBtns = document.querySelectorAll(".erase-btn");
const cards = {};
PLACES.forEach((p) => (cards[p] = document.querySelector(`.card[data-place="${p}"]`)));
const arrows = document.querySelectorAll(".arrow");

let runId = 0;        // 「世界を戻す」で途中の演出を止めるための番号
let current = null;   // いま表示中のシナリオ

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 最初の状態に戻す ----------
function resetWorld() {
  runId++;
  current = null;
  document.body.className = "";
  PLACES.forEach((p) => {
    cards[p].className = "card";
    cards[p].querySelector(".text").textContent = INITIAL[p];
  });
  arrows.forEach((a) => {
    a.classList.remove("show");
    a.querySelector(".reason").textContent = "";
  });
  ["loading", "trouble", "nextBtn", "paper", "sourceBadge"].forEach((id) => $(id).classList.add("hidden"));
  $("stageLabel").textContent = "いつもの世界";
  $("shatter").innerHTML = "";
  setEraseEnabled(true);
}

function setEraseEnabled(on) {
  eraseBtns.forEach((b) => (b.disabled = !on));
}

// ---------- 言葉が砕ける演出 ----------
function shatterWord(word, btn) {
  const box = btn.getBoundingClientRect();
  const layer = $("shatter");
  [...word].forEach((ch, i) => {
    const s = document.createElement("span");
    s.textContent = ch;
    s.style.left = box.left + box.width / 2 - 40 + i * 44 + "px";
    s.style.top = box.top - 30 + "px";
    s.style.setProperty("--dx", (Math.random() - 0.5) * 400 + "px");
    s.style.setProperty("--dy", -150 - Math.random() * 250 + "px");
    s.style.setProperty("--rot", (Math.random() - 0.5) * 720 + "deg");
    layer.appendChild(s);
  });
  setTimeout(() => (layer.innerHTML = ""), 1100);
}

// ---------- AI生成（失敗したらサンプル） ----------
async function askAI(target) {
  const ctrl = new AbortController();
  const timer = TIMEOUT_MS > 0 ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { kind: "fail" };
    const data = await res.json();
    if (!isValid(data)) return { kind: "fail" };
    if (hasNgWord(data)) return { kind: "ng" };
    return { kind: "ok", data };
  } catch (e) {
    return { kind: "fail" }; // 10秒切れ・通信失敗
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 形式が崩れていないかを確かめる
function isValid(d) {
  const ok = (s) => typeof s === "string" && s.trim().length > 0 && s.length <= 60;
  try {
    return (
      PLACES.every((p) => ok(d.first[p]) && ok(d.adapt[p])) &&
      Array.isArray(d.reasons) && d.reasons.length >= 3 && d.reasons.slice(0, 3).every(ok) &&
      ok(d.trouble) && ok(d.headline)
    );
  } catch (e) {
    return false;
  }
}

// 実在の名前が混ざっていないかを確かめる
function hasNgWord(d) {
  if (d.real_names === true) return true; // AI自身が「実在の名前を使った」と答えた場合
  const all = JSON.stringify([d.first, d.reasons, d.trouble, d.adapt, d.headline]);
  return NG_WORDS.some((w) => all.includes(w));
}

async function getScenario(target, myRun) {
  for (let i = 1; i <= MAX_TRIES; i++) {
    if (myRun !== runId) return null;
    $("loadingText").textContent =
      i === 1 ? "AIが「消えた世界」を計算中…" : `AIが世界を作り直し中…（${i}/${MAX_TRIES}）`;
    const r = await askAI(target);
    if (r.kind === "ok") return { data: r.data, source: "ai" };
    if (r.kind === "fail") break; // 通信失敗・形式崩れはすぐサンプルへ
    // r.kind === "ng" のときだけ作り直す
  }
  return { data: SAMPLES[target], source: "sample" };
}

// ---------- 消すボタン ----------
async function onErase(e) {
  const btn = e.currentTarget;
  const target = btn.dataset.target;
  const myRun = ++runId;

  setEraseEnabled(false);
  shatterWord(target, btn);
  $("stageLabel").textContent = `「${target}」を消去中…`;
  $("loading").classList.remove("hidden");

  const result = await getScenario(target, myRun);
  if (!result || myRun !== runId) return; // 途中で「世界を戻す」が押された
  current = result;
  $("loading").classList.add("hidden");

  // 最初の変化：カードを1枚ずつ裏返す
  document.body.className = "mode-good";
  $("stageLabel").textContent = `「${target}」が消えた世界`;
  for (let i = 0; i < PLACES.length; i++) {
    if (myRun !== runId) return;
    const p = PLACES[i];
    flip(cards[p], result.data.first[p], "good");
    if (i > 0) {
      arrows[i - 1].querySelector(".reason").textContent = result.data.reasons[i - 1];
      arrows[i - 1].classList.add("show");
    }
    await wait(FLIP_GAP_MS);
  }

  // 意外な困り事
  await wait(600);
  if (myRun !== runId) return;
  document.body.className = "mode-bad";
  $("trouble").textContent = "でも… " + result.data.trouble;
  $("trouble").classList.remove("hidden");
  $("nextBtn").classList.remove("hidden");
}

function flip(card, text, kind) {
  card.classList.remove("flip", "good", "weird");
  void card.offsetWidth; // 演出をやり直すため
  card.classList.add("flip", kind);
  setTimeout(() => (card.querySelector(".text").textContent = text), 300);
}

// ---------- さらにその先 ----------
async function onNext() {
  if (!current) return;
  const myRun = runId;
  $("nextBtn").classList.add("hidden");
  document.body.className = "mode-weird";
  $("stageLabel").textContent = "人々は、適応した。";
  for (const p of PLACES) {
    if (myRun !== runId) return;
    flip(cards[p], current.data.adapt[p], "weird");
    await wait(FLIP_GAP_MS);
  }
  if (myRun !== runId) return;
  $("headline").textContent = current.data.headline;
  $("paper").classList.remove("hidden");
  $("sourceBadge").textContent = current.source === "ai" ? "この世界はAI生成です" : "この世界はサンプルです";
  $("sourceBadge").classList.remove("hidden");
}

// ---------- ボタンに動きをつなぐ ----------
eraseBtns.forEach((b) => b.addEventListener("click", onErase));
$("nextBtn").addEventListener("click", onNext);
$("resetBtn").addEventListener("click", resetWorld);
resetWorld();
