const {
  liveCategories: seedLiveCategories,
  liveStreams: seedLiveStreams,
  vodCategories: seedVodCategories,
  vodStreams: seedVodStreams,
  seriesCategories: seedSeriesCategories,
  series: seedSeries,
} = require("../data/sampleData");

const DEFAULT_TIMEOUT_MS = Number(process.env.M3U_IMPORT_TIMEOUT_MS || 15000);

const state = {
  liveCategories: [...seedLiveCategories],
  liveStreams: [...seedLiveStreams],
  vodCategories: [...seedVodCategories],
  vodStreams: [...seedVodStreams],
  seriesCategories: [...seedSeriesCategories],
  series: [...seedSeries],
  importedAt: null,
  source: "sampleData",
};

function getCatalog() {
  return state;
}

function parseExtInfAttributes(metadata) {
  const attrs = {};
  const attrPattern = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
  let match = attrPattern.exec(metadata);

  while (match) {
    attrs[String(match[1]).toLowerCase()] = String(match[2]);
    match = attrPattern.exec(metadata);
  }

  return attrs;
}

function classifyType(groupTitle, channelName) {
  const text = `${groupTitle} ${channelName}`.toLowerCase();

  if (/\b(movie|movies|film|cinema|vod|4k movie)\b/.test(text)) {
    return "vod";
  }

  if (/\b(series|tv series|season|episode|show|shows)\b/.test(text)) {
    return "series";
  }

  return "live";
}

function normalizeGroup(groupTitle, fallbackName, type) {
  const raw = String(groupTitle || "").trim();
  if (raw) return raw;

  if (type === "vod") return "Movies";
  if (type === "series") return "Series";

  const fallback = String(fallbackName || "").trim();
  if (/\bfootball|soccer\b/i.test(fallback)) {
    return "Football";
  }

  return "Live";
}

function parseM3U(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("#EXTINF:")) {
      continue;
    }

    const commaIndex = line.indexOf(",");
    const metadata = commaIndex >= 0 ? line.slice(0, commaIndex) : line;
    const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "Unknown";
    const attributes = parseExtInfAttributes(metadata);

    let streamUrl = "";
    for (let next = index + 1; next < lines.length; next += 1) {
      if (!lines[next].startsWith("#")) {
        streamUrl = lines[next];
        index = next;
        break;
      }
    }

    if (!streamUrl) {
      continue;
    }

    const type = classifyType(attributes["group-title"], name);
    const group = normalizeGroup(attributes["group-title"], name, type);

    entries.push({
      name,
      url: streamUrl,
      type,
      group,
      tvg_id: attributes["tvg-id"] || "",
      tvg_logo: attributes["tvg-logo"] || "",
    });
  }

  return entries;
}

function toCatalog(entries) {
  const liveCategories = [];
  const vodCategories = [];
  const seriesCategories = [];

  const liveStreams = [];
  const vodStreams = [];
  const series = [];

  const categoryMaps = {
    live: new Map(),
    vod: new Map(),
    series: new Map(),
  };

  let liveCategoryId = 1;
  let vodCategoryId = 10;
  let seriesCategoryId = 20;

  let liveStreamId = 100000;
  let vodStreamId = 200000;
  let seriesId = 300000;

  function ensureCategory(type, name) {
    const map = categoryMaps[type];
    if (map.has(name)) {
      return map.get(name);
    }

    if (type === "live") {
      const category_id = String(liveCategoryId);
      liveCategoryId += 1;
      const row = { category_id, category_name: name, parent_id: 0 };
      liveCategories.push(row);
      map.set(name, category_id);
      return category_id;
    }

    if (type === "vod") {
      const category_id = String(vodCategoryId);
      vodCategoryId += 1;
      const row = { category_id, category_name: name, parent_id: 0 };
      vodCategories.push(row);
      map.set(name, category_id);
      return category_id;
    }

    const category_id = String(seriesCategoryId);
    seriesCategoryId += 1;
    const row = { category_id, category_name: name, parent_id: 0 };
    seriesCategories.push(row);
    map.set(name, category_id);
    return category_id;
  }

  for (const item of entries) {
    const category_id = ensureCategory(item.type, item.group);

    if (item.type === "live") {
      liveStreams.push({
        stream_id: liveStreamId,
        name: item.name,
        category_id,
        stream_icon: item.tvg_logo || "",
        epg_channel_id: item.tvg_id || `iptv.live.${liveStreamId}`,
        url: item.url,
      });
      liveStreamId += 1;
      continue;
    }

    if (item.type === "vod") {
      vodStreams.push({
        stream_id: vodStreamId,
        name: item.name,
        category_id,
        stream_icon: item.tvg_logo || "",
        container_extension: "mp4",
        url: item.url,
      });
      vodStreamId += 1;
      continue;
    }

    series.push({
      series_id: seriesId,
      name: item.name,
      category_id,
      cover: item.tvg_logo || "",
      plot: "Imported from M3U source",
    });
    seriesId += 1;
  }

  return {
    liveCategories,
    liveStreams,
    vodCategories,
    vodStreams,
    seriesCategories,
    series,
  };
}

async function fetchM3U(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "3stars-iptv-backend/1.0" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch playlist: HTTP ${response.status}`);
    }

    const text = await response.text();
    if (!text.includes("#EXTM3U")) {
      throw new Error("Source does not look like a valid M3U playlist");
    }

    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function importFromM3UUrl(url, options = {}) {
  const sourceUrl = String(url || "").trim();
  if (!sourceUrl) {
    throw new Error("M3U source URL is required");
  }

  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const text = await fetchM3U(sourceUrl, timeoutMs);
  const entries = parseM3U(text);

  if (!entries.length) {
    throw new Error("No stream entries found in playlist");
  }

  const nextCatalog = toCatalog(entries);

  state.liveCategories = nextCatalog.liveCategories;
  state.liveStreams = nextCatalog.liveStreams;
  state.vodCategories = nextCatalog.vodCategories;
  state.vodStreams = nextCatalog.vodStreams;
  state.seriesCategories = nextCatalog.seriesCategories;
  state.series = nextCatalog.series;
  state.importedAt = new Date().toISOString();
  state.source = sourceUrl;

  return {
    source: sourceUrl,
    imported_at: state.importedAt,
    totals: {
      live_categories: state.liveCategories.length,
      live_streams: state.liveStreams.length,
      vod_categories: state.vodCategories.length,
      vod_streams: state.vodStreams.length,
      series_categories: state.seriesCategories.length,
      series: state.series.length,
    },
  };
}

module.exports = {
  getCatalog,
  importFromM3UUrl,
};
