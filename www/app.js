const { useState, useEffect, useCallback } = React;

const DAY_NAMES = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const DAY_NAMES_SHORT = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const DEFAULT_LIMIT = 2000;
const MORNING_COFFEE = { name: "Кофе", grams: "", kcal100: "", kcal: 100, id: "coffee-default" };

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return addDays(startOfDay(d), diff);
}
function formatDate(d) {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

function buildCycleWeeks(anchorDate) {
  const week1Monday = startOfWeek(startOfDay(anchorDate));
  const weeks = [];
  for (let i = 0; i < 4; i++) {
    const start = addDays(week1Monday, i * 7);
    const days = Array.from({ length: 7 }, (_, j) => addDays(start, j));
    weeks.push({ days });
  }
  return weeks;
}

function IconPlus() {
  return React.createElement("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" },
    React.createElement("path", { d: "M12 5v14M5 12h14" }));
}
function IconX() {
  return React.createElement("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" },
    React.createElement("path", { d: "M18 6L6 18M6 6l12 12" }));
}
function IconPencil({ className }) {
  return React.createElement("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", className },
    React.createElement("path", { d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" }));
}
function IconCheck() {
  return React.createElement("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M20 6L9 17l-5-5" }));
}
function IconReset() {
  return React.createElement("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M3 12a9 9 0 1 0 3-6.7" }),
    React.createElement("path", { d: "M3 4v5h5" }));
}

const storage = {
  get(key) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? null : JSON.parse(v);
    } catch (e) {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
};

function CalorieTracker() {
  const today = new Date();
  const todayKey = dateKey(today);

  const [dayData, setDayData] = useState(() => storage.get("day-data") || {});
  const [burnedByDay, setBurnedByDay] = useState(() => storage.get("burned-by-day") || {});
  const [anchorKey, setAnchorKey] = useState(() => {
    const stored = storage.get("anchor-date");
    if (stored) return stored;
    storage.set("anchor-date", todayKey);
    return todayKey;
  });

  const [name, setName] = useState("");
  const [grams, setGrams] = useState("");
  const [kcal100, setKcal100] = useState("");
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");
  const [saveError, setSaveError] = useState(false);

  const anchorDate = parseDateKey(anchorKey);
  const cycleWeeks = buildCycleWeeks(anchorDate);

  let activeIndex = cycleWeeks.findIndex((w) => {
    const last = w.days[w.days.length - 1];
    return startOfDay(today) <= last;
  });
  const cycleActive = activeIndex !== -1;
  const displayActiveIndex = cycleActive ? activeIndex : 3;

  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(displayActiveIndex);
  const [burnedWeekIndex, setBurnedWeekIndex] = useState(0);

  const goToToday = () => {
    setSelectedDayKey(todayKey);
    setSelectedWeekIndex(displayActiveIndex);
  };

  const resetAll = () => {
    const confirmed = window.confirm("Сбросить все данные и начать отсчёт заново с сегодняшнего дня? Это действие нельзя отменить.");
    if (!confirmed) return;
    setDayData({});
    setBurnedByDay({});
    storage.set("day-data", {});
    storage.set("burned-by-day", {});
    storage.set("anchor-date", todayKey);
    setAnchorKey(todayKey);
    setSaveError(false);
    setSelectedDayKey(todayKey);
    setSelectedWeekIndex(0);
    setBurnedWeekIndex(0);
  };

  const persist = useCallback((next) => {
    const ok = storage.set("day-data", next);
    setSaveError(!ok);
  }, []);

  const persistBurnedByDay = useCallback((next) => {
    const ok = storage.set("burned-by-day", next);
    if (!ok) setSaveError(true);
  }, []);

  const getDay = (key) => dayData[key] || { limit: DEFAULT_LIMIT, entries: key === todayKey ? [MORNING_COFFEE] : [] };

  const updateDay = (key, updater) => {
    setDayData((prev) => {
      const current = prev[key] || { limit: DEFAULT_LIMIT, entries: key === todayKey ? [MORNING_COFFEE] : [] };
      const updated = updater(current);
      const next = { ...prev, [key]: updated };
      persist(next);
      return next;
    });
  };

  const portionKcal = (() => {
    const g = parseFloat(grams);
    const k = parseFloat(kcal100);
    const hasGrams = !isNaN(g) && g > 0;
    const hasKcal = !isNaN(k) && k > 0;
    if (!hasKcal) return null;
    return hasGrams ? Math.round((g * k) / 100) : Math.round(k);
  })();

  const addEntry = () => {
    if (portionKcal === null) return;
    updateDay(selectedDayKey, (day) => ({
      ...day,
      entries: [...day.entries, { name: name.trim() || "Без названия", grams, kcal100, kcal: portionKcal, id: Date.now() }],
    }));
    setName("");
    setGrams("");
    setKcal100("");
  };

  const removeEntry = (id) => {
    updateDay(selectedDayKey, (day) => ({ ...day, entries: day.entries.filter((e) => e.id !== id) }));
  };

  const selectedDayDate = parseDateKey(selectedDayKey);
  const selectedDay = getDay(selectedDayKey);
  const isViewingToday = selectedDayKey === todayKey;

  const startEditLimit = () => {
    setLimitDraft(String(selectedDay.limit));
    setEditingLimit(true);
  };
  const saveLimit = () => {
    const val = parseInt(limitDraft, 10);
    if (!isNaN(val) && val > 0) updateDay(selectedDayKey, (day) => ({ ...day, limit: val }));
    setEditingLimit(false);
  };

  const selectedWeek = cycleWeeks[selectedWeekIndex];
  const isViewingActiveWeek = selectedWeekIndex === displayActiveIndex;

  const weekLimit = selectedWeek.days.reduce((sum, d) => sum + getDay(dateKey(d)).limit, 0);

  let weekEaten = 0;
  selectedWeek.days.forEach((d) => {
    if (d <= today) weekEaten += getDay(dateKey(d)).entries.reduce((s, e) => s + e.kcal, 0);
  });

  const selectedDayEaten = selectedDay.entries.reduce((s, e) => s + e.kcal, 0);
  const selectedDayRemaining = selectedDay.limit - selectedDayEaten;
  const weekRemaining = weekLimit - weekEaten;
  const weekProgress = weekLimit > 0 ? Math.min(100, Math.round((weekEaten / weekLimit) * 100)) : 0;

  const monthWeeks = cycleWeeks.map((w, i) => {
    const weekKey = dateKey(w.days[0]);
    const limit = w.days.reduce((sum, d) => sum + getDay(dateKey(d)).limit, 0);
    let eaten = 0;
    w.days.forEach((d) => {
      if (d <= today) eaten += getDay(dateKey(d)).entries.reduce((s, e) => s + e.kcal, 0);
    });
    const isPast = !cycleActive || i < activeIndex;
    return { weekNumber: i + 1, limit, eaten, days: w.days, weekKey, isPast };
  });

  const monthLimit = monthWeeks.reduce((s, w) => s + w.limit, 0);
  const monthEaten = monthWeeks.reduce((s, w) => s + w.eaten, 0);
  const monthRemaining = monthLimit - monthEaten;
  const monthProgress = monthLimit > 0 ? Math.min(100, Math.round((monthEaten / monthLimit) * 100)) : 0;

  const DEFAULT_BURNED = 0;
  const getBurnedValue = (key) => (burnedByDay[key] !== undefined ? burnedByDay[key] : "");
  const setBurnedValue = (key, value) => {
    setBurnedByDay((prev) => {
      const next = { ...prev, [key]: value };
      persistBurnedByDay(next);
      return next;
    });
  };
  const burnedForDay = (key) => {
    const raw = getBurnedValue(key);
    return raw === "" ? DEFAULT_BURNED : parseFloat(raw) || 0;
  };
  const weekBurnedSum = (weekIndex) => cycleWeeks[weekIndex].days.reduce((s, d) => s + burnedForDay(dateKey(d)), 0);

  const monthBurned = cycleWeeks.reduce((s, w, i) => s + weekBurnedSum(i), 0);
  const netDiff = monthEaten - monthBurned;
  const netKg = netDiff / 7700;

  const cardStyle = { borderRadius: 16, border: "1px solid #e7e5e4", padding: 20 };
  const labelStyle = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#a8a29e" };
  const smallMuted = { fontSize: 11, color: "#a8a29e", marginTop: 2 };
  const linkStyle = { fontSize: 11, color: "#059669", background: "none", border: "none", padding: 0, fontWeight: 600 };

  return React.createElement("div", { style: { minHeight: "100vh", background: "#fff", color: "#1c1917" } },
    React.createElement("div", { style: { maxWidth: 420, margin: "0 auto", padding: "32px 20px 64px" } },

      React.createElement("div", { style: { marginBottom: 8, display: "flex", alignItems: "baseline", justifyContent: "space-between" } },
        React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 10 } },
          React.createElement("span", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" } }, DAY_NAMES[today.getDay()]),
          React.createElement("span", { style: { fontSize: 18, color: "#a8a29e", fontWeight: 500 } }, formatDate(today))
        ),
        React.createElement("button", {
          onClick: resetAll,
          title: "Сбросить всё и начать заново",
          style: { background: "none", border: "none", color: "#a8a29e", padding: 4, display: "flex", alignSelf: "center" }
        }, React.createElement(IconReset))
      ),

      !cycleActive && React.createElement("p", { style: { fontSize: 12, color: "#a8a29e", marginBottom: 20 } }, "Цикл из 4 недель завершён. Нажмите на значок сброса, чтобы начать новый."),
      cycleActive && React.createElement("div", { style: { marginBottom: 28 } }),

      // Day card
      React.createElement("div", { style: { ...cardStyle, marginBottom: 16 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement("span", { style: labelStyle },
            isViewingToday ? "Сегодня" : `${DAY_NAMES_SHORT[selectedDayDate.getDay()]}, ${formatDate(selectedDayDate)}`
          ),
          !isViewingToday && React.createElement("button", { onClick: goToToday, style: linkStyle }, "Сегодня")
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 4 } },
          React.createElement("div", null,
            React.createElement("div", { className: "tabular", style: { fontSize: 24, fontWeight: 700, color: selectedDayRemaining < 0 ? "#f43f5e" : "#059669" } }, selectedDayRemaining),
            React.createElement("div", { style: smallMuted }, "остаток")
          ),
          React.createElement("div", { style: { textAlign: "center" } },
            React.createElement("div", { className: "tabular", style: { fontSize: 24, fontWeight: 700 } }, selectedDayEaten),
            React.createElement("div", { style: smallMuted }, "съедено")
          ),
          React.createElement("div", { style: { textAlign: "right" } },
            !editingLimit
              ? React.createElement("button", { onClick: startEditLimit, style: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, background: "none", border: "none", padding: 0, color: "inherit", width: "100%" } },
                  React.createElement("span", { className: "tabular", style: { fontSize: 24, fontWeight: 700 } }, selectedDay.limit),
                  React.createElement(IconPencil, { className: "" })
                )
              : React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 } },
                  React.createElement("input", {
                    type: "number", autoFocus: true, value: limitDraft,
                    onChange: (e) => setLimitDraft(e.target.value),
                    onKeyDown: (e) => e.key === "Enter" && saveLimit(),
                    style: { width: 64, fontSize: 18, fontWeight: 700, border: "1px solid #d6d3d1", borderRadius: 6, padding: "2px 6px" }
                  }),
                  React.createElement("button", { onClick: saveLimit, style: { background: "none", border: "none", color: "#059669" } }, React.createElement(IconCheck))
                ),
            React.createElement("div", { style: smallMuted }, "лимит")
          )
        ),
        React.createElement("div", { style: { marginTop: 12, height: 6, background: "#f5f5f4", borderRadius: 999, overflow: "hidden", marginBottom: 12 } },
          React.createElement("div", { style: { height: "100%", borderRadius: 999, width: `${Math.min(100, (selectedDayEaten / selectedDay.limit) * 100)}%`, background: selectedDayEaten > selectedDay.limit ? "#fb7185" : "#10b981", transition: "width 0.2s" } })
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } },
          selectedWeek.days.map((d, i) => {
            const key = dateKey(d);
            const isSelected = key === selectedDayKey;
            const isFuture = d > today;
            const dd = getDay(key);
            const eaten = dd.entries.reduce((s, e) => s + e.kcal, 0);
            const over = eaten > dd.limit && dd.entries.length > 0;
            const dotColor = isFuture ? "#f5f5f4" : over ? "#fb7185" : dd.entries.length > 0 ? "#10b981" : "#e7e5e4";
            return React.createElement("button", {
              key: i,
              onClick: () => !isFuture && setSelectedDayKey(key),
              disabled: isFuture,
              style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", padding: 4, cursor: isFuture ? "default" : "pointer" }
            },
              React.createElement("span", { style: { fontSize: 10, fontWeight: isSelected ? 700 : 400, color: isSelected ? "#1c1917" : "#a8a29e" } }, DAY_NAMES_SHORT[d.getDay()]),
              React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: isSelected ? "0 0 0 2px #a7f3d0" : "none" } })
            );
          })
        )
      ),

      // Add entry
      React.createElement("div", { style: { ...cardStyle, marginBottom: 16 } },
        React.createElement("span", { style: { ...labelStyle, marginBottom: 12, display: "block" } }, "Добавить"),
        React.createElement("input", {
          type: "text", placeholder: "Название", value: name,
          onChange: (e) => setName(e.target.value),
          style: { width: "100%", border: "1px solid #e7e5e4", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 10 }
        }),
        React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 12 } },
          React.createElement("input", {
            type: "number", inputMode: "decimal", placeholder: "Вес, г", value: grams,
            onChange: (e) => setGrams(e.target.value),
            style: { width: "50%", border: "1px solid #e7e5e4", borderRadius: 8, padding: "10px 12px", fontSize: 14 }
          }),
          React.createElement("input", {
            type: "number", inputMode: "decimal", placeholder: "Калорий на 100г", value: kcal100,
            onChange: (e) => setKcal100(e.target.value),
            style: { width: "50%", border: "1px solid #e7e5e4", borderRadius: 8, padding: "10px 12px", fontSize: 14 }
          })
        ),
        portionKcal !== null && React.createElement("div", { style: { textAlign: "center", fontSize: 14, color: "#78716c", marginBottom: 12 } },
          "= ", React.createElement("span", { style: { fontWeight: 700, color: "#1c1917" } }, portionKcal), " ккал в порции"
        ),
        React.createElement("button", {
          onClick: () => addEntry(), disabled: portionKcal === null,
          style: {
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: portionKcal === null ? "#f5f5f4" : "#059669",
            color: portionKcal === null ? "#a8a29e" : "#fff",
            border: "none", borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 600
          }
        }, React.createElement(IconPlus), " Добавить")
      ),

      // Entries
      selectedDay.entries.length > 0 && React.createElement("div", { style: { ...cardStyle, marginBottom: 16 } },
        React.createElement("span", { style: { ...labelStyle, marginBottom: 12, display: "block" } }, "Записи"),
        React.createElement("ul", { style: { listStyle: "none", margin: 0, padding: 0 } },
          selectedDay.entries.map((e) =>
            React.createElement("li", { key: e.id, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f5f5f4" } },
              React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 14 } }, e.name),
                React.createElement("div", { style: { fontSize: 11, color: "#a8a29e" } }, e.grams && e.kcal100 ? `${e.grams} г · ${e.kcal100} ккал/100г` : "ккал указаны напрямую")
              ),
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement("span", { className: "tabular", style: { fontWeight: 600, fontSize: 14 } }, e.kcal),
                React.createElement("button", { onClick: () => removeEntry(e.id), style: { background: "none", border: "none", color: "#d6d3d1" } }, React.createElement(IconX))
              )
            )
          )
        )
      ),

      // Week card
      React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement("span", { style: labelStyle }, `Неделя ${selectedWeekIndex + 1}`),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
            !isViewingActiveWeek && React.createElement("button", { onClick: () => setSelectedWeekIndex(displayActiveIndex), style: linkStyle }, "Текущая"),
            React.createElement("span", { style: { fontSize: 11, color: "#a8a29e" } }, `${weekProgress}%`)
          )
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 } },
          React.createElement("div", null,
            React.createElement("div", { className: "tabular", style: { fontSize: 20, fontWeight: 700, color: weekRemaining < 0 ? "#f43f5e" : "#059669" } }, weekRemaining),
            React.createElement("div", { style: smallMuted }, "остаток")
          ),
          React.createElement("div", { style: { textAlign: "center" } },
            React.createElement("div", { className: "tabular", style: { fontSize: 20, fontWeight: 700 } }, weekEaten),
            React.createElement("div", { style: smallMuted }, "съедено")
          ),
          React.createElement("div", { style: { textAlign: "right" } },
            React.createElement("div", { className: "tabular", style: { fontSize: 20, fontWeight: 700 } }, weekLimit),
            React.createElement("div", { style: smallMuted }, "лимит")
          )
        ),
        React.createElement("div", { style: { height: 6, background: "#f5f5f4", borderRadius: 999, overflow: "hidden", marginBottom: 12 } },
          React.createElement("div", { style: { height: "100%", borderRadius: 999, width: `${weekProgress}%`, background: weekEaten > weekLimit ? "#fb7185" : "#10b981", transition: "width 0.2s" } })
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } },
          monthWeeks.map((w, i) => {
            const over = w.eaten > w.limit && w.eaten > 0;
            const dotColor = over ? "#fb7185" : w.eaten > 0 ? "#10b981" : "#e7e5e4";
            const isSelectedWeek = i === selectedWeekIndex;
            return React.createElement("button", {
              key: w.weekNumber,
              onClick: () => setSelectedWeekIndex(i),
              style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", padding: 4, cursor: "pointer" }
            },
              React.createElement("span", { style: { fontSize: 10, fontWeight: isSelectedWeek ? 700 : 400, color: isSelectedWeek ? "#1c1917" : "#a8a29e" } }, `Нед. ${w.weekNumber}`),
              React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: isSelectedWeek ? "0 0 0 2px #a7f3d0" : "none" } }),
              React.createElement("span", { className: "tabular", style: { fontSize: 10, color: "#a8a29e", minHeight: 12 } }, w.isPast ? w.eaten : "")
            );
          })
        )
      ),

      // Month card
      React.createElement("div", { style: { ...cardStyle, marginTop: 16 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement("span", { style: labelStyle }, "Месяц"),
          React.createElement("span", { style: { fontSize: 11, color: "#a8a29e" } }, `${monthProgress}%`)
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 } },
          React.createElement("div", null,
            React.createElement("div", { className: "tabular", style: { fontSize: 20, fontWeight: 700, color: monthRemaining < 0 ? "#f43f5e" : "#059669" } }, monthRemaining),
            React.createElement("div", { style: smallMuted }, "остаток")
          ),
          React.createElement("div", { style: { textAlign: "center" } },
            React.createElement("div", { className: "tabular", style: { fontSize: 20, fontWeight: 700 } }, monthEaten),
            React.createElement("div", { style: smallMuted }, "съедено")
          ),
          React.createElement("div", { style: { textAlign: "right" } },
            React.createElement("div", { className: "tabular", style: { fontSize: 20, fontWeight: 700 } }, monthLimit),
            React.createElement("div", { style: smallMuted }, "лимит")
          )
        ),
        React.createElement("div", { style: { height: 6, background: "#f5f5f4", borderRadius: 999, overflow: "hidden", marginBottom: 12 } },
          React.createElement("div", { style: { height: "100%", borderRadius: 999, width: `${monthProgress}%`, background: monthEaten > monthLimit ? "#fb7185" : "#10b981", transition: "width 0.2s" } })
        )
      ),

      // Burned calories card
      React.createElement("div", { style: { ...cardStyle, marginTop: 16 } },
        React.createElement("span", { style: { ...labelStyle, marginBottom: 16, display: "block" } }, "Потрачено калорий"),

        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 16 } },
          cycleWeeks[burnedWeekIndex].days.map((d, i) => {
            const key = dateKey(d);
            return React.createElement("div", { key: i, style: { display: "flex", flexDirection: "column", alignItems: "center" } },
              React.createElement("span", { style: { fontSize: 10, color: "#a8a29e", marginBottom: 6 } }, DAY_NAMES_SHORT[d.getDay()]),
              React.createElement("input", {
                type: "number", inputMode: "decimal", placeholder: String(DEFAULT_BURNED),
                value: getBurnedValue(key),
                onChange: (e) => setBurnedValue(key, e.target.value),
                style: { width: "100%", textAlign: "center", border: "1px solid #e7e5e4", borderRadius: 8, padding: "8px 2px", fontSize: 12 }
              })
            );
          })
        ),

        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20, borderTop: "1px solid #f5f5f4", paddingTop: 16 } },
          [0, 1, 2, 3].map((w) => {
            const weekNetDiff = monthWeeks[w].eaten - weekBurnedSum(w);
            return React.createElement("button", {
              key: w,
              onClick: () => setBurnedWeekIndex(w),
              style: {
                display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", borderRadius: 8,
                background: burnedWeekIndex === w ? "#ecfdf5" : "transparent",
                border: burnedWeekIndex === w ? "1px solid #a7f3d0" : "1px solid transparent"
              }
            },
              React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: "#78716c" } }, `Неделя ${w + 1}`),
              React.createElement("span", { className: "tabular", style: { fontSize: 14, fontWeight: 700, marginTop: 4, color: weekNetDiff <= 0 ? "#059669" : "#f43f5e" } },
                `${weekNetDiff > 0 ? "+" : ""}${weekNetDiff}`
              )
            );
          })
        ),

        React.createElement("div", { style: { textAlign: "center", borderTop: "1px solid #f5f5f4", paddingTop: 16 } },
          React.createElement("div", { className: "tabular", style: { fontSize: 24, fontWeight: 700, color: netDiff <= 0 ? "#059669" : "#f43f5e" } },
            `${netDiff > 0 ? "+" : ""}${netDiff} ккал`
          ),
          React.createElement("div", { style: { fontSize: 14, color: "#a8a29e", marginTop: 4 } },
            `≈ ${netKg > 0 ? "+" : ""}${netKg.toFixed(2)} кг`
          )
        )
      ),

      saveError && React.createElement("p", { style: { textAlign: "center", fontSize: 12, color: "#f43f5e", marginTop: 16 } }, "Не удалось сохранить данные.")
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(CalorieTracker));
