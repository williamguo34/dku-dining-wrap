// DKU Dining Wrap — core stats + parsing helpers
// Pure data logic. No DOM dependencies.

(() => {
  function parseAmount(x){
    const v = Number(String(x ?? "").replace(/[^0-9.\-+]/g,""));
    return Number.isFinite(v) ? v : 0;
  }

  function parseDateTime(s){
    const raw = String(s ?? "").trim();
    if (!raw) return null;

    let d = new Date(raw);
    if (!isNaN(d.getTime())) return d;

    const norm = raw.replace(/[./]/g, "-");
    d = new Date(norm);
    if (!isNaN(d.getTime())) return d;

    return null;
  }

  function incMap(map, key, delta){
    map.set(key, (map.get(key) || 0) + delta);
  }

  function topNFromMap(map, n){
    return Array.from(map.entries())
      .map(([key,value]) => ({key, value}))
      .sort((a,b) => b.value - a.value)
      .slice(0, n);
  }

  // --- Row classification (filter non-dining)
  function classifyRow(r){
    const type = String(r.type || "").toLowerCase();
    const service = String(r.service || "").toLowerCase();

    if (type.includes("wechat top up") || type.includes("微信充值")) return "topup";
    if (service.includes("pharos") || service.includes("printing") || service.includes("打印")) return "printing";
    if (type.includes("social medical insurance") || service.includes("rms-")) return "admin";

    if (type.includes("expense") || type.includes("消费")) return "expense";
    return "other";
  }

  function inferIsDining(r){
    // classify as dining if it's an expense
    if (classifyRow(r) !== "expense") return false;

    const service = String(r.service || "");
    // Common dining stall formats: 2F-5 / 3F-3 / 1F-2
    if (/\b[1-9]F-\d+\b/i.test(service)) return true;

    // If in the future some dining halls don't have floor formats, whitelist here
    // const wl = ["zartar", "late diner", "weigh-and-pay", "taste of the occident", "juice bar", "harbour deli", "malatang"];
    // if (wl.some(k => service.toLowerCase().includes(k))) return true;

    return false;
  }

  function spendValue(r){
    // Unified: dining spend (positive number)
    // DKU "Expense" entries usually have negative amounts.
    // We count only negative values as spend; positive entries (refunds/adjustments) become 0 here.
    const amt = parseAmount(r.amount);
    return (classifyRow(r) === "expense" && amt < 0) ? (-amt) : 0;
  }

  function computeStats(rows){
    const totalRows = rows.length;

    // Count categories on the original dataset (before dining filter)
    const catCounts = { dining: 0, topup: 0, printing: 0, admin: 0, expense_non_dining: 0, other: 0 };
    for (const r of rows) {
      const cls = classifyRow(r);
      if (cls === "topup") catCounts.topup += 1;
      else if (cls === "printing") catCounts.printing += 1;
      else if (cls === "admin") catCounts.admin += 1;
      else if (cls === "expense") {
        if (inferIsDining(r)) catCounts.dining += 1;
        else catCounts.expense_non_dining += 1;
      } else {
        catCounts.other += 1;
      }
    }

    const diningRows = rows.filter(r => inferIsDining(r));
    const txns = diningRows.length;
    const amounts = diningRows.map(r => spendValue(r));
    const totalSpend = amounts.reduce((a,b) => a + b, 0);

    const spendByService = new Map();
    const visitsByService = new Map();

    const hours = Array.from({length:24}, (_,h)=>({hour:h, count:0}));
    const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>({day:d, count:0}));
    const spendByMonth = new Map(); // YYYY-MM

    let validTime = 0;

    for (const r of diningRows){
      const amt = spendValue(r); // positive number spend
      const svc = String(r.service ?? "").trim() || "Unknown";
      incMap(spendByService, svc, amt);
      incMap(visitsByService, svc, 1);

      const d = parseDateTime(r.dateTime);
      if (d){
        validTime += 1;
        hours[d.getHours()].count += 1;
        weekdays[d.getDay()].count += 1;

        const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        incMap(spendByMonth, ym, amt);
      }
    }

    const topSpend = topNFromMap(spendByService, 8);
    const topVisits = topNFromMap(visitsByService, 8);

    const favorite = topVisits[0]?.key || "—";
    const favoriteCount = topVisits[0]?.value || 0;

    const peakHour = hours.reduce((best, cur) => cur.count > best.count ? cur : best, hours[0]);
    const peakWeekday = weekdays.reduce((best, cur) => cur.count > best.count ? cur : best, weekdays[0]);

    const months = Array.from(spendByMonth.entries())
      .map(([month, spend]) => ({month, spend}))
      .sort((a,b) => a.month.localeCompare(b.month));

    return {
      txns,
      totalSpend,
      topSpend,
      topVisits,
      favorite,
      favoriteCount,
      peakHour,
      peakWeekday,
      hours,
      weekdays,
      months,
      validTime,
      meta: {
        totalRows,
        diningRows: diningRows.length,
        catCounts,
      }
    };
  }

  function fmtMoney(x){
    const v = Number(x);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }

  window.DKUWrapCore = {
    computeStats,
    fmtMoney,
    classifyRow,
    inferIsDining,
    spendValue,
  };
})();
