const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

  const now = new Date();
  const timeUTC = `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")}`;
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dayName = DAY_NAMES[now.getUTCDay()];

  const subs = await sbGet("/rest/v1/push_subscriptions?select=user_id,subscription");
  const userData = await sbGet("/rest/v1/stack_tracker?select=user_id,data");

  const debug = {
    serverTimeUTC: now.toISOString(),
    currentTimeUTC: timeUTC,
    currentDayUTC: dayName,
    subscriptionCount: subs.length,
    userCount: userData.length,
    compounds: []
  };

  for (const row of userData) {
    if (!row?.data?.compounds) continue;
    for (const c of row.data.compounds) {
      if (c.status !== "active") continue;
      debug.compounds.push({
        name: c.name,
        notifyTime: c.notifyTime,
        notifyEnabled: c.notifyEnabled,
        days: c.dayStages?.[0]?.days,
        timeMatch: c.notifyTime === timeUTC,
      });
    }
  }

  res.json(debug);
};
