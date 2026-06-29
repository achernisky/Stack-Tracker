const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  "mailto:achernisky@gmail.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function todayDayName() { return DAY_NAMES[new Date().getUTCDay()]; }
function currentTime() {
  const now = new Date();
  return `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")}`;
}

async function sbGet(path) {
  const r = await fetch(SUPABASE_URL + path, {
    headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": "Bearer " + SUPABASE_SERVICE_KEY },
  });
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dayName = todayDayName();
  const timeNow = currentTime();
  const today = new Date().toISOString().split("T")[0];

  const subs = await sbGet("/rest/v1/push_subscriptions?select=user_id,subscription");
  const userData = await sbGet("/rest/v1/stack_tracker?select=user_id,data");

  let sent = 0;
  const errors = [];
  for (const sub of subs) {
    const userRow = userData.find(u => u.user_id === sub.user_id);
    if (!userRow?.data?.compounds) continue;
    for (const compound of userRow.data.compounds) {
      if (compound.status !== "active") continue;
      if (compound.notifyEnabled === false) continue;
      if (!compound.notifyTime || compound.notifyTime !== timeNow) continue;
      const stage = [...(compound.dayStages||[])].filter(s=>s.fromDate<=today).sort((a,b)=>b.fromDate.localeCompare(a.fromDate))[0];
      if (!stage?.days?.includes(dayName)) continue;
      try {
        const subscription = JSON.parse(sub.subscription);
        const doseStage = [...(compound.doseStages||[])].filter(s=>s.fromDate<=today).sort((a,b)=>b.fromDate.localeCompare(a.fromDate))[0];
        const doseStr = doseStage?.doseMg ? `${doseStage.doseMg}mg` : doseStage?.doseUnits ? `${doseStage.doseUnits}u` : "";
        await webpush.sendNotification(subscription, JSON.stringify({
          title: "Stack Tracker",
          body: `Time to dose ${compound.name}${doseStr ? " — " + doseStr : ""}`,
          tag: compound.id,
        }));