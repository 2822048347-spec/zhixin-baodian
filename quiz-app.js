/* ============================================================
 * 智心宝典 · 刷题逻辑  quiz-app.js  v0.2
 * ------------------------------------------------------------
 * v0.2 升级：
 *  1. 支持三种题型 single(单选)/multi(多选)/judge(判断)
 *  2. 增加"确认提交"按钮防误触：选答案后需点确认才出结果
 *  3. 四段式解析展示（conclusion/reason/memory/extend）
 *  4. 难度星级显示
 *  5. 多选严判：全对才算对
 * 仍保持模块化、QuizApp.init(root) 入口、localStorage 持久化
 * ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "zxbk_state_v1";
  var EXAM_LENGTH = 10;
  var EXAM_SECONDS = 600;

  /* ---------- 状态 ---------- */
  var state = loadState();

  function defaultState() {
    return {
      seqIndex: 0,
      seqChapter: null,  // null=全部；选了某章则只刷该章
      answered: {},    // { 题id: 选中的选项索引 } 单选/判断；多选存数组
      wrong: [],
      starred: [],
      stats: { totalAnswered: 0, totalCorrect: 0, examHistory: [] }
    };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      var d = defaultState();
      for (var k in d) if (!(k in s)) s[k] = d[k];
      if (!s.stats) s.stats = d.stats;
      for (var k2 in d.stats) if (!(k2 in s.stats)) s.stats[k2] = d.stats[k2];
      return s;
    } catch (e) { return defaultState(); }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- 数据辅助 ---------- */
  function questions() { return window.QUIZ_DATA.questions; }
  function chapterById(id) {
    var list = window.QUIZ_DATA.chapters;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function qById(id) {
    var qs = questions();
    for (var i = 0; i < qs.length; i++) if (qs[i].id === id) return qs[i];
    return null;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function diffStars(d) {
    if (d === 3) return "★★★";
    if (d === 2) return "★★";
    return "★";
  }
  function diffLabel(d) {
    if (d === 3) return "困难";
    if (d === 2) return "中等";
    return "简单";
  }

  /* ---------- 判分核心 ---------- */
  // 返回 { correct: bool, selectedArr: [索引] }
  // single/judge: selected 为数字；multi: selected 为数组
  function judge(q, selected) {
    if (q.type === "multi") {
      var sel = Array.isArray(selected) ? selected.slice().sort(function (a, b) { return a - b; }) : [];
      var ans = q.answer.slice().sort(function (a, b) { return a - b; });
      if (sel.length !== ans.length) return { correct: false, selectedArr: sel };
      for (var i = 0; i < sel.length; i++) if (sel[i] !== ans[i]) return { correct: false, selectedArr: sel };
      return { correct: true, selectedArr: sel };
    }
    // single / judge
    var s = (typeof selected === "number") ? selected : -1;
    return { correct: s === q.answer, selectedArr: [s] };
  }
  // 某项是否被选中（用于高亮）
  function isSelected(q, selected, idx) {
    if (q.type === "multi") return Array.isArray(selected) && selected.indexOf(idx) >= 0;
    return selected === idx;
  }
  // 某项是否是正确答案
  function isCorrectOption(q, idx) {
    if (q.type === "multi") return q.answer.indexOf(idx) >= 0;
    return q.answer === idx;
  }

  /* ---------- 渲染容器 ---------- */
  var root = null;
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function setView(html) {
    root.innerHTML = html;
    bindGoEvents();
    window.scrollTo(0, 0);
  }

  /* ---------- 路由 ---------- */
  function go(view, arg) {
    if (view === "home") renderHome();
    else if (view === "seq") {
      if (arg) renderSeq();        // 从章节选择页选了某章，bindGoEvents 已设 seqChapter
      else renderSeqChapterSelect(); // 从首页来，先显示章节选择页
    }
    else if (view === "random") renderRandom();
    else if (view === "wrong") renderWrong();
    else if (view === "starred") renderStarred();
    else if (view === "exam") renderExam(arg);
    else if (view === "stats") renderStats();
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    var data = window.QUIZ_DATA;
    var done = 0;
    var qs = questions();
    for (var i = 0; i < qs.length; i++) if (state.answered[qs[i].id] != null) done++;
    var pct = qs.length ? Math.round(done / qs.length * 100) : 0;

    var cards = [
      { v: "seq",     icon: "📋", t: "顺序练习", d: "按章节逐题过，答错即讲" },
      { v: "random",  icon: "🎲", t: "随机抽题", d: "打乱顺序检验掌握度" },
      { v: "wrong",   icon: "❌", t: "错题本",   d: "专攻答错题，剩 " + state.wrong.length },
      { v: "starred", icon: "⭐", t: "收藏夹",   d: "标记的重要题 " + state.starred.length },
      { v: "exam",    icon: "📝", t: "模拟考试", d: EXAM_LENGTH + "题限时测验" },
      { v: "stats",   icon: "📊", t: "学习统计", d: "进度·正确率·考试记录" }
    ];
    var cardsHtml = cards.map(function (c) {
      return '<button class="quiz-card" data-go="' + c.v + '">' +
        '<span class="quiz-card-icon">' + c.icon + '</span>' +
        '<span class="quiz-card-body"><span class="quiz-card-t">' + c.t + '</span>' +
        '<span class="quiz-card-d">' + c.d + '</span></span></button>';
    }).join("");

    setView(
      '<div class="quiz-home">' +
        '<div class="quiz-hero">' +
          '<h1 class="quiz-hero-t">智心宝典</h1>' +
          '<p class="quiz-hero-s">心率变异性 · 精神压力 · 刷题学习</p>' +
          '<div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:' + pct + '%"></div></div>' +
          '<p class="quiz-progress-txt">已练习 ' + done + ' / ' + qs.length + ' 题 · ' + pct + '%</p>' +
        '</div>' +
        '<div class="quiz-cards">' + cardsHtml + '</div>' +
        '<p class="quiz-foot">' + data.meta.totalNote + '</p>' +
      '</div>'
    );
  }

  /* ---------- 章节选择页（顺序练习入口） ---------- */
  function renderSeqChapterSelect() {
    var data = window.QUIZ_DATA;
    var chapters = data.chapters;
    var allQs = questions();

    // "全部章节"卡片
    var allDone = 0;
    for (var i = 0; i < allQs.length; i++) if (state.answered[allQs[i].id] != null) allDone++;
    var allPct = allQs.length ? Math.round(allDone / allQs.length * 100) : 0;

    var cards = '<button class="quiz-chap-card quiz-chap-all" data-go="seq" data-chapter="all">' +
      '<span class="quiz-chap-icon">📚</span>' +
      '<span class="quiz-chap-body"><span class="quiz-chap-t">全部章节</span>' +
      '<span class="quiz-chap-d">共 ' + allQs.length + ' 题 · 已练 ' + allDone + '/' + allQs.length + ' · ' + allPct + '%</span>' +
      '</span></button>';

    // 各章节卡片
    for (var j = 0; j < chapters.length; j++) {
      var c = chapters[j];
      var cq = [];
      for (var k = 0; k < allQs.length; k++) if (allQs[k].chapter === c.id) cq.push(allQs[k]);
      var done = 0;
      for (var m = 0; m < cq.length; m++) if (state.answered[cq[m].id] != null) done++;
      var pct = cq.length ? Math.round(done / cq.length * 100) : 0;
      cards += '<button class="quiz-chap-card" data-go="seq" data-chapter="' + c.id + '">' +
        '<span class="quiz-chap-icon">' + c.icon + '</span>' +
        '<span class="quiz-chap-body"><span class="quiz-chap-t">' + c.title + '</span>' +
        '<span class="quiz-chap-d">共 ' + cq.length + ' 题 · 已练 ' + done + '/' + cq.length + ' · ' + pct + '%</span>' +
        '</span></button>';
    }

    setView(
      '<div class="quiz-chap-select">' +
        '<div class="quiz-chap-head">' +
          '<button class="quiz-back-btn" data-go="home">‹ 返回</button>' +
          '<h2 class="quiz-chap-title">选择章节</h2>' +
        '</div>' +
        '<p class="quiz-chap-hint">选择要练习的章节，或刷全部题目</p>' +
        '<div class="quiz-chap-list">' + cards + '</div>' +
      '</div>'
    );
  }

  /* ---------- 解析渲染（四段式 / 兼容旧字符串） ---------- */
  function renderExplain(q, correct) {
    var ex = q.explain;
    if (typeof ex === "string") {
      // 旧格式兼容
      return '<div class="quiz-explain ' + (correct ? "quiz-explain-ok" : "quiz-explain-no") + '">' +
        '<div class="quiz-explain-head">' + (correct ? "✓ 答对了" : "✗ 答错了") + '</div>' +
        '<div class="quiz-explain-legacy">' + ex + '</div></div>';
    }
    // 四段式
    var secs = "";
    if (ex.conclusion) secs += explainSec("结论", ex.conclusion, "");
    if (ex.reason) secs += explainSec("原理", ex.reason, "");
    if (ex.memory) secs += explainSec("记忆点", ex.memory, "memory");
    if (ex.extend) secs += explainSec("延伸", ex.extend, "extend");
    return '<div class="quiz-explain ' + (correct ? "quiz-explain-ok" : "quiz-explain-no") + '">' +
      '<div class="quiz-explain-head">' + (correct ? "✓ 答对了" : "✗ 答错了") + '</div>' +
      '<div class="quiz-explain-body">' + secs + '</div></div>';
  }
  function explainSec(label, txt, cls) {
    return '<div class="quiz-explain-sec quiz-explain-sec-' + cls + '">' +
      '<div class="quiz-explain-label">' + label + '</div>' +
      '<div class="quiz-explain-txt">' + txt + '</div></div>';
  }

  /* ---------- 单题渲染（核心：含确认按钮） ---------- */
  // opts: { q, index, total, selected, showResult, onConfirm, onStar, isStarred, onPrev, onNext, prevLabel, nextLabel, examMode }
  // selected: 已确认作答的值（showResult=true 时用）；pendingSel: 未确认的临时选中
  function renderQuestion(opts) {
    var q = opts.q;
    var showResult = opts.showResult;
    var confirmedSel = opts.selected;        // 已确认的作答
    var pendingSel = opts.pendingSel;        // 未确认的临时选中
    var isStarred = opts.isStarred;
    var isMulti = q.type === "multi";

    // 当前要高亮的选中态
    var displaySel = showResult ? confirmedSel : pendingSel;

    var optsHtml = q.options.map(function (o, i) {
      var cls = "quiz-opt";
      var mark;
      if (isMulti) {
        mark = '<span class="quiz-opt-checkbox">✓</span>';
      } else {
        mark = '<span class="quiz-opt-mark">' + "ABCD"[i] + '</span>';
      }
      if (showResult) {
        if (isCorrectOption(q, i)) cls += " quiz-opt-correct";
        else if (isSelected(q, displaySel, i)) cls += " quiz-opt-wrong";
      } else if (isSelected(q, displaySel, i)) {
        cls += " quiz-opt-sel";
      }
      return '<button class="' + cls + '" data-opt="' + i + '"' +
        (showResult ? ' disabled' : '') + '>' +
        mark + '<span class="quiz-opt-txt">' + o + '</span></button>';
    }).join("");

    // 确认按钮（仅在未出结果时显示）
    var confirmHtml = "";
    if (!showResult && !opts.examMode) {
      // 练习模式：选中后显示确认按钮
      var canConfirm = canSubmit(q, pendingSel);
      confirmHtml = '<div class="quiz-confirm-bar">' +
        '<button class="quiz-confirm-btn" data-act="confirm"' + (canConfirm ? '' : ' disabled') + '>确认提交</button>' +
        '<p class="quiz-confirm-hint">' + confirmHint(q, pendingSel) + '</p>' +
        '</div>';
    }
    if (!showResult && opts.examMode) {
      // 考试模式：不显示确认按钮（考试中允许反复改），由底部导航的"下一题/交卷"隐式确认
    }

    var explainHtml = showResult ? renderExplain(q, judge(q, confirmedSel).correct) : "";

    // 导航
    var navHtml = "";
    if (opts.onPrev || opts.onNext) {
      navHtml = '<div class="quiz-nav">';
      navHtml += opts.onPrev
        ? '<button class="quiz-btn quiz-btn-ghost" data-act="prev">' + (opts.prevLabel || "上一题") + '</button>'
        : '<span></span>';
      navHtml += '<span class="quiz-nav-pos">' + (opts.index + 1) + " / " + opts.total + '</span>';
      navHtml += opts.onNext
        ? '<button class="quiz-btn quiz-btn-ghost" data-act="next">' + (opts.nextLabel || "下一题") + '</button>'
        : '<span></span>';
      navHtml += '</div>';
    }

    // 题头：返回 + 章节 + 难度
    var chap = chapterById(q.chapter);
    var typeHint = isMulti ? "多选题" : (q.type === "judge" ? "判断题" : "单选题");
    var backBtn = opts.examMode
      ? '<button class="quiz-back" data-act="exam-quit">‹ 退出考试</button>'
      : '<button class="quiz-back" data-go="home">‹ 返回</button>';
    var header = '<div class="quiz-qhead">' +
      backBtn +
      (chap ? '<span class="quiz-chip">' + chap.icon + " " + chap.title + '</span>' : "") +
      '<span class="quiz-difficulty" title="' + diffLabel(q.difficulty) + '">' + diffStars(q.difficulty) + '</span>' +
      '</div>';

    // 结束本次答题按钮（仅顺序练习等提供 onEndSession 时显示）
    var endBtn = (typeof opts.onEndSession === "function")
      ? '<div class="quiz-end-bar"><button class="quiz-btn quiz-btn-danger" data-act="end-session">结束本次答题</button></div>'
      : "";

    var starBtn = (typeof opts.onStar === "function")
      ? '<button class="quiz-star' + (isStarred ? " quiz-star-on" : "") + '" data-act="star">' +
        (isStarred ? "★ 已收藏" : "☆ 收藏") + '</button>'
      : "";

    setView(
      '<div class="quiz-question">' +
        header +
        '<h2 class="quiz-q">' + q.q + '</h2>' +
        '<div class="quiz-q-type-hint">' + typeHint + '</div>' +
        (starBtn ? '<div style="margin-bottom:12px">' + starBtn + '</div>' : "") +
        '<div class="quiz-opts">' + optsHtml + '</div>' +
        confirmHtml +
        explainHtml +
        navHtml +
        endBtn +
      '</div>'
    );

    // 绑定选项点击（未出结果时）+ 所有 data-act 按钮，统一用事件委托
    bindQuestionEvents(opts, q, pendingSel, showResult);
  }

  /* ---------- 题目页事件委托（统一绑定，避免渲染时机问题） ---------- */
  function bindQuestionEvents(opts, q, pendingSel, showResult) {
    // 选项点击
    if (!showResult) {
      var optBtns = root.querySelectorAll("[data-opt]");
      for (var i = 0; i < optBtns.length; i++) {
        (function (btn) {
          btn.addEventListener("click", function () {
            var idx = parseInt(btn.getAttribute("data-opt"), 10);
            if (opts.onPick) opts.onPick(idx);
          });
        })(optBtns[i]);
      }
    }
    // 确认按钮
    var confirmBtn = root.querySelector('[data-act="confirm"]');
    if (confirmBtn && opts.onConfirm) {
      confirmBtn.addEventListener("click", function () {
        if (canSubmit(q, pendingSel)) opts.onConfirm(pendingSel);
      });
    }
    // 收藏
    var starEl = root.querySelector('[data-act="star"]');
    if (starEl && opts.onStar) starEl.addEventListener("click", function () { opts.onStar(); });
    // 导航
    var prevEl = root.querySelector('[data-act="prev"]');
    if (prevEl && opts.onPrev) prevEl.addEventListener("click", function () { opts.onPrev(); });
    var nextEl = root.querySelector('[data-act="next"]');
    if (nextEl && opts.onNext) nextEl.addEventListener("click", function () { opts.onNext(); });
    // 注：end-session 和 exam-quit 由 init 时的全局事件委托统一处理，不在此逐个绑定
  }

  function canSubmit(q, sel) {
    if (q.type === "multi") return Array.isArray(sel) && sel.length > 0;
    return typeof sel === "number";
  }
  function confirmHint(q, sel) {
    if (q.type === "multi") {
      if (!Array.isArray(sel) || !sel.length) return "请至少选择一项后再提交";
      return "已选 " + sel.length + " 项，点击确认提交";
    }
    return typeof sel === "number" ? "已选择，点击确认提交" : "请选择一个选项";
  }

  /* ---------- 顺序练习 ---------- */
  // 临时选中状态（未确认）
  var seqPending = null; // 当前题的临时选中
  function renderSeq() {
    var allQs = questions();
    var qs = state.seqChapter ? allQs.filter(function (q) { return q.chapter === state.seqChapter; }) : allQs;
    if (!qs.length) return setView('<div class="quiz-empty">该章节暂无题目</div>');
    if (state.seqIndex >= qs.length) state.seqIndex = 0;
    var q = qs[state.seqIndex];
    var answeredSel = state.answered[q.id];
    var showResult = answeredSel != null;
    // 临时选中：如果已答过，沿用已答值；否则用本会话临时值
    var pending = showResult ? answeredSel : (seqPending != null ? seqPending : null);

    renderQuestion({
      q: q, index: state.seqIndex, total: qs.length,
      selected: answeredSel,
      pendingSel: pending,
      showResult: showResult,
      isStarred: state.starred.indexOf(q.id) >= 0,
      onPick: function (idx) {
        if (showResult) return; // 已答过不让改
        // 多选切换
        if (q.type === "multi") {
          var arr = Array.isArray(seqPending) ? seqPending.slice() : [];
          var p = arr.indexOf(idx);
          if (p >= 0) arr.splice(p, 1); else arr.push(idx);
          seqPending = arr;
        } else {
          seqPending = idx;
        }
        renderSeq();
      },
      onConfirm: function (sel) {
        // 提交作答
        state.answered[q.id] = sel;
        var r = judge(q, sel);
        state.stats.totalAnswered++;
        if (r.correct) state.stats.totalCorrect++;
        else if (state.wrong.indexOf(q.id) < 0) state.wrong.push(q.id);
        seqPending = null;
        saveState();
        renderSeq();
      },
      onStar: function () { toggleStar(q.id); renderSeq(); },
      onPrev: state.seqIndex > 0 ? function () {
        state.seqIndex--; seqPending = null; saveState(); renderSeq();
      } : null,
      onNext: state.seqIndex < qs.length - 1 ? function () {
        state.seqIndex++; seqPending = null; saveState(); renderSeq();
      } : null,
      onEndSession: function () {
        if (confirm("结束本次答题？\n本次作答记录将清空，可重新开始一轮。\n（错题本、收藏、累计统计会保留）")) {
          state.answered = {};
          state.seqIndex = 0;
          seqPending = null;
          saveState();
          go("home");
        }
      }
    });
  }

  /* ---------- 随机抽题 ---------- */
  var randomList = null;
  var randomIdx = 0;
  var randomPending = null;
  function renderRandom() {
    if (!randomList) randomList = shuffle(questions());
    if (randomIdx >= randomList.length) randomIdx = 0;
    var q = randomList[randomIdx];
    renderQuestion({
      q: q, index: randomIdx, total: randomList.length,
      selected: null, pendingSel: randomPending, showResult: false,
      isStarred: state.starred.indexOf(q.id) >= 0,
      onPick: function (idx) {
        if (q.type === "multi") {
          var arr = Array.isArray(randomPending) ? randomPending.slice() : [];
          var p = arr.indexOf(idx);
          if (p >= 0) arr.splice(p, 1); else arr.push(idx);
          randomPending = arr;
        } else {
          randomPending = idx;
        }
        renderRandom();
      },
      onConfirm: function (sel) {
        var r = judge(q, sel);
        state.stats.totalAnswered++;
        if (r.correct) state.stats.totalCorrect++;
        else if (state.wrong.indexOf(q.id) < 0) state.wrong.push(q.id);
        saveState();
        randomPending = null;
        // 显示结果
        renderQuestion({
          q: q, index: randomIdx, total: randomList.length,
          selected: sel, showResult: true,
          isStarred: state.starred.indexOf(q.id) >= 0,
          onStar: function () { toggleStar(q.id); renderRandom(); },
          onNext: randomIdx < randomList.length - 1 ? function () {
            randomIdx++; randomPending = null; renderRandom();
          } : null,
          nextLabel: "下一题"
        });
      },
      onStar: function () { toggleStar(q.id); renderRandom(); },
      onNext: randomIdx < randomList.length - 1 ? function () {
        randomIdx++; randomPending = null; renderRandom();
      } : null,
      onEndSession: function () {
        if (confirm("结束本次答题？\n随机抽题进度将清空，可重新开始。\n（错题本、收藏、累计统计会保留）")) {
          randomList = null;
          randomIdx = 0;
          randomPending = null;
          go("home");
        }
      }
    });
  }

  /* ---------- 错题本 / 收藏夹 ---------- */
  function renderWrong() {
    if (!state.wrong.length) return setView('<div class="quiz-empty"><p>还没有错题，继续加油！</p><button class="quiz-btn" data-go="home">返回首页</button></div>');
    renderList(state.wrong, "错题本", "wrong");
  }
  function renderStarred() {
    if (!state.starred.length) return setView('<div class="quiz-empty"><p>还没有收藏，做题时点 ☆ 即可收藏。</p><button class="quiz-btn" data-go="home">返回首页</button></div>');
    renderList(state.starred, "收藏夹", "starred");
  }
  function renderList(ids, title, backView) {
    var itemsHtml = ids.map(function (id, i) {
      var q = qById(id);
      if (!q) return "";
      var typeTag = q.type === "multi" ? "[多选] " : (q.type === "judge" ? "[判断] " : "");
      return '<button class="quiz-list-item" data-list-idx="' + i + '">' +
        '<span class="quiz-list-num">' + (i + 1) + '</span>' +
        '<span class="quiz-list-txt">' + typeTag + q.q + '</span></button>';
    }).join("");
    setView(
      '<div class="quiz-list-view">' +
        '<div class="quiz-list-head"><button class="quiz-back" data-go="home">‹ 返回</button>' +
        '<h2 class="quiz-list-t">' + title + '（' + ids.length + '）</h2></div>' +
        '<div class="quiz-list">' + itemsHtml + '</div>' +
      '</div>'
    );
    var btns = root.querySelectorAll("[data-list-idx]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var idx = parseInt(btn.getAttribute("data-list-idx"), 10);
          startListDrill(ids, idx, backView, null);
        });
      })(btns[i]);
    }
  }
  // 列表单题练习，pending 由闭包维护
  function startListDrill(ids, idx, backView, pending) {
    var q = qById(ids[idx]);
    if (!q) return;
    renderQuestion({
      q: q, index: idx, total: ids.length,
      selected: null, pendingSel: pending, showResult: false,
      isStarred: state.starred.indexOf(q.id) >= 0,
      onPick: function (selIdx) {
        if (q.type === "multi") {
          var arr = Array.isArray(pending) ? pending.slice() : [];
          var p = arr.indexOf(selIdx);
          if (p >= 0) arr.splice(p, 1); else arr.push(selIdx);
          startListDrill(ids, idx, backView, arr);
        } else {
          startListDrill(ids, idx, backView, selIdx);
        }
      },
      onConfirm: function (sel) {
        var r = judge(q, sel);
        state.stats.totalAnswered++;
        if (r.correct) state.stats.totalCorrect++;
        if (r.correct && backView === "wrong") {
          var p = state.wrong.indexOf(q.id);
          if (p >= 0) state.wrong.splice(p, 1);
        }
        saveState();
        // 显示结果
        renderQuestion({
          q: q, index: idx, total: ids.length,
          selected: sel, showResult: true,
          isStarred: state.starred.indexOf(q.id) >= 0,
          onStar: function () { toggleStar(q.id); startListDrill(ids, idx, backView, null); },
          onPrev: idx > 0 ? function () { startListDrill(ids, idx - 1, backView, null); } : null,
          onNext: idx < ids.length - 1 ? function () { startListDrill(ids, idx + 1, backView, null); } : null,
          nextLabel: "下一题"
        });
      },
      onStar: function () { toggleStar(q.id); startListDrill(ids, idx, backView, pending); },
      onPrev: idx > 0 ? function () { startListDrill(ids, idx - 1, backView, null); } : null,
      onNext: idx < ids.length - 1 ? function () { startListDrill(ids, idx + 1, backView, null); } : null
    });
  }

  /* ---------- 模拟考试 ---------- */
  var exam = null;
  function renderExam(arg) {
    if (arg === "result" && exam && exam.done) return renderExamResult();
    exam = {
      list: shuffle(questions()).slice(0, EXAM_LENGTH),
      idx: 0, answers: {}, remain: EXAM_SECONDS, timer: null, done: false
    };
    renderExamQ(null);
  }
  function renderExamQ(pending) {
    if (exam.idx >= exam.list.length) return finishExam();
    var q = exam.list[exam.idx];
    var answered = exam.answers[q.id];
    renderQuestion({
      q: q, index: exam.idx, total: exam.list.length,
      selected: answered, pendingSel: pending, showResult: false,
      examMode: true,
      isStarred: state.starred.indexOf(q.id) >= 0,
      onPick: function (idx) {
        if (q.type === "multi") {
          var arr = Array.isArray(pending) ? pending.slice() : (Array.isArray(answered) ? answered.slice() : []);
          var p = arr.indexOf(idx);
          if (p >= 0) arr.splice(p, 1); else arr.push(idx);
          exam.answers[q.id] = arr;
          renderExamQ(arr);
        } else {
          exam.answers[q.id] = idx;
          renderExamQ(idx);
        }
      },
      // 考试模式没有 confirm 按钮，直接记录在 answers 里
      onPrev: exam.idx > 0 ? function () { exam.idx--; renderExamQ(null); } : null,
      onNext: exam.idx < exam.list.length ? function () {
        // 翻到下一题前，如果是多选且 pending 有值，确保存入
        if (q.type === "multi" && Array.isArray(pending)) exam.answers[q.id] = pending;
        exam.idx++; renderExamQ(null);
      } : null,
      nextLabel: exam.idx === exam.list.length - 1 ? "交卷" : "下一题"
    });
    // 倒计时条
    var timerBar = el("div", "quiz-exam-timer", "⏱ 剩余 " + fmtTime(exam.remain));
    var qEl = root.querySelector(".quiz-question");
    if (qEl) qEl.insertBefore(timerBar, qEl.firstChild);
    startTimer();
  }
  function startTimer() {
    if (exam.timer) clearInterval(exam.timer);
    exam.timer = setInterval(function () {
      exam.remain--;
      var t = root.querySelector(".quiz-exam-timer");
      if (t) t.textContent = "⏱ 剩余 " + fmtTime(exam.remain);
      if (exam.remain <= 0) finishExam();
    }, 1000);
  }
  function fmtTime(s) {
    if (s < 0) s = 0;
    var m = Math.floor(s / 60), ss = s % 60;
    return m + ":" + (ss < 10 ? "0" : "") + ss;
  }
  function finishExam() {
    if (exam.timer) clearInterval(exam.timer);
    exam.done = true;
    var correct = 0;
    for (var i = 0; i < exam.list.length; i++) {
      var q = exam.list[i];
      if (judge(q, exam.answers[q.id]).correct) correct++;
    }
    exam.score = correct;
    state.stats.examHistory.push({ score: correct, total: exam.list.length, date: Date.now() });
    saveState();
    renderExamResult();
  }
  function renderExamResult() {
    var html = '<div class="quiz-exam-result">' +
      '<h2>考试结束</h2>' +
      '<div class="quiz-score">' + exam.score + ' / ' + exam.list.length + '</div>' +
      '<p class="quiz-score-tip">' + rateScore(exam.score, exam.list.length) + '</p>' +
      '<div class="quiz-exam-review">';
    for (var i = 0; i < exam.list.length; i++) {
      var q = exam.list[i];
      var sel = exam.answers[q.id];
      var r = judge(q, sel);
      var typeTag = q.type === "multi" ? "[多选] " : (q.type === "judge" ? "[判断] " : "");
      html += '<div class="quiz-review-item">' +
        '<div class="quiz-review-q">' + (i + 1) + ". " + typeTag + q.q + '</div>';
      // 你的答案
      var yourAns = "未作答";
      if (q.type === "multi" && Array.isArray(sel) && sel.length) {
        yourAns = sel.slice().sort(function(a,b){return a-b;}).map(function (x) { return "ABCD"[x]; }).join("、");
      } else if (typeof sel === "number") {
        yourAns = q.options[sel];
      }
      html += '<div class="quiz-review-ans ' + (r.correct ? "ok" : "no") + '">你的答案：' + yourAns + (r.correct ? " ✓" : " ✗") + '</div>';
      if (!r.correct) {
        var rightAns;
        if (q.type === "multi") rightAns = q.answer.slice().sort(function(a,b){return a-b;}).map(function (x) { return q.options[x]; }).join("、");
        else rightAns = q.options[q.answer];
        html += '<div class="quiz-review-right">正确答案：' + rightAns + '</div>';
      }
      // 解析摘要（只显示结论+记忆点，省篇幅）
      var ex = q.explain;
      var exTxt = typeof ex === "string" ? ex : (ex.conclusion + " " + (ex.memory || ""));
      html += '<div class="quiz-review-exp">' + exTxt + '</div></div>';
    }
    html += '</div><div class="quiz-exam-actions">' +
      '<button class="quiz-btn" data-go="exam">再来一场</button>' +
      '<button class="quiz-btn quiz-btn-ghost" data-go="home">返回首页</button>' +
      '</div></div>';
    setView(html);
  }
  function rateScore(s, total) {
    var p = total ? s / total : 0;
    if (p >= 0.9) return "掌握出色，可以出师了！";
    if (p >= 0.7) return "掌握良好，再巩固薄弱点就稳了。";
    if (p >= 0.5) return "基础尚可，建议重点刷错题本。";
    return "还要多练，回到顺序练习打好基础。";
  }

  /* ---------- 学习统计 ---------- */
  function renderStats() {
    var st = state.stats;
    var acc = st.totalAnswered ? Math.round(st.totalCorrect / st.totalAnswered * 100) : 0;
    var qs = questions();
    var covered = 0;
    for (var i = 0; i < qs.length; i++) if (state.answered[qs[i].id] != null) covered++;

    var examHtml = "";
    if (st.examHistory.length) {
      examHtml = st.examHistory.slice(-5).reverse().map(function (h, i) {
        var n = st.examHistory.length - i;
        return '<tr><td>第 ' + n + ' 次</td><td>' + h.score + ' / ' + h.total + '</td><td>' +
          (h.total ? Math.round(h.score / h.total * 100) : 0) + '%</td></tr>';
      }).join("");
      examHtml = '<div class="quiz-stat-block"><h3>最近 5 次考试</h3>' +
        '<table class="quiz-stat-table"><tr><th>场次</th><th>得分</th><th>正确率</th></tr>' + examHtml + '</table></div>';
    } else {
      examHtml = '<div class="quiz-stat-block"><p class="quiz-muted">还没有考试记录</p></div>';
    }

    setView(
      '<div class="quiz-stats">' +
        '<div class="quiz-list-head"><button class="quiz-back" data-go="home">‹ 返回</button><h2>学习统计</h2></div>' +
        '<div class="quiz-stat-grid">' +
          statCard("已练习题数", covered + " / " + qs.length) +
          statCard("累计作答", st.totalAnswered) +
          statCard("累计正确", st.totalCorrect) +
          statCard("平均正确率", acc + "%") +
          statCard("错题待清", state.wrong.length) +
          statCard("已收藏", state.starred.length) +
        '</div>' +
        examHtml +
        '<div class="quiz-stat-block"><button class="quiz-btn quiz-btn-danger" data-act="reset">清空全部记录</button></div>' +
      '</div>'
    );
    var resetBtn = root.querySelector('[data-act="reset"]');
    if (resetBtn) resetBtn.addEventListener("click", function () {
      if (confirm("确定清空全部学习记录吗？此操作不可撤销。")) {
        state = defaultState(); saveState(); seqPending = null; randomPending = null;
        go("home");
      }
    });
  }
  function statCard(t, v) {
    return '<div class="quiz-stat-card"><div class="quiz-stat-v">' + v + '</div><div class="quiz-stat-t">' + t + '</div></div>';
  }

  /* ---------- 辅助 ---------- */
  function toggleStar(id) {
    var p = state.starred.indexOf(id);
    if (p >= 0) state.starred.splice(p, 1);
    else state.starred.push(id);
    saveState();
  }

  /* ---------- 通用 data-go 事件绑定 ---------- */
  function bindGoEvents() {
    var goBtns = root.querySelectorAll("[data-go]");
    for (var i = 0; i < goBtns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var v = btn.getAttribute("data-go");
          var ch = btn.getAttribute("data-chapter");
          if (v === "random") { randomList = null; randomPending = null; }
          if (v === "exam") exam = null;
          if (v === "seq") {
            seqPending = null;
            if (ch) { state.seqChapter = (ch === "all" ? null : ch); state.seqIndex = 0; saveState(); }
          }
          if (v === "home") { seqPending = null; randomPending = null; }
          go(v, ch);
        });
      })(goBtns[i]);
    }
  }

  /* ---------- 对外入口 ---------- */
  window.QuizApp = {
    init: function (container) {
      root = container;
      /* 全局事件委托：处理"结束本次答题"和"退出考试"按钮
       * 绑在 root 上只绑一次，不随渲染重建，确保按钮一定能响应点击 */
      root.addEventListener("click", function (e) {
        var target = e.target;
        var el = target.closest ? target.closest("[data-act]") : null;
        if (!el) return;
        var act = el.getAttribute("data-act");
        if (act === "end-session") {
          state.answered = {};
          state.seqIndex = 0;
          seqPending = null;
          randomList = null;
          randomIdx = 0;
          randomPending = null;
          saveState();
          go("home");
        } else if (act === "exam-quit") {
          if (exam && exam.timer) clearInterval(exam.timer);
          exam = null;
          go("home");
        }
      });
      go("home");
    },
    go: go,
    resetAll: function () { state = defaultState(); saveState(); seqPending = null; randomPending = null; }
  };
})();
