const serverInfo = {
  name: "3 Stars IPTV",
  protocol: "xtream",
  timezone: "UTC",
  url: "your-server.com",
  port: 8080,
};

const users = [
  {
    username: "demo",
    password: "demo123",
    status: "Active",
    exp_date: "1893456000",
    max_connections: 2,
    is_trial: 0,
  },
];

const liveCategories = [
  { category_id: "1", category_name: "News", parent_id: 0 },
  { category_id: "2", category_name: "Sports", parent_id: 0 },
  { category_id: "3", category_name: "Entertainment", parent_id: 0 },
];

const liveStreams = [
  {
    stream_id: 1001,
    name: "3 Stars News HD",
    category_id: "1",
    stream_icon: "",
    epg_channel_id: "3stars.news",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  },
  {
    stream_id: 1002,
    name: "3 Stars Sports 1",
    category_id: "2",
    stream_icon: "",
    epg_channel_id: "3stars.sports1",
    url: "https://test-streams.mux.dev/test_001/stream.m3u8",
  },
  {
    stream_id: 1003,
    name: "3 Stars Cinema",
    category_id: "3",
    stream_icon: "",
    epg_channel_id: "3stars.cinema",
    url: "https://test-streams.mux.dev/dai-discontinuity-deltatre/manifest.m3u8",
  },
];

const vodCategories = [
  { category_id: "10", category_name: "Movies", parent_id: 0 },
  { category_id: "11", category_name: "Kids", parent_id: 0 },
];

const seriesCategories = [{ category_id: "20", category_name: "Series", parent_id: 0 }];

const vodStreams = [
  {
    stream_id: 2001,
    name: "Big Buck Bunny",
    category_id: "10",
    stream_icon: "",
    container_extension: "mp4",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    stream_id: 2002,
    name: "Sintel",
    category_id: "10",
    stream_icon: "",
    container_extension: "mp4",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  },
];

const series = [
  {
    series_id: 3001,
    name: "3 Stars Originals",
    category_id: "20",
    cover: "",
    plot: "Sample series metadata.",
  },
];

const epg = {
  1001: [
    {
      id: "e1001-1",
      title: "Morning Headlines",
      description: "Top news updates.",
      start: "20260323060000 +0000",
      stop: "20260323070000 +0000",
    },
    {
      id: "e1001-2",
      title: "World Report",
      description: "International coverage.",
      start: "20260323070000 +0000",
      stop: "20260323080000 +0000",
    },
  ],
  1002: [
    {
      id: "e1002-1",
      title: "Football Highlights",
      description: "Daily highlights.",
      start: "20260323060000 +0000",
      stop: "20260323070000 +0000",
    },
  ],
};

module.exports = {
  serverInfo,
  users,
  liveCategories,
  liveStreams,
  vodCategories,
  vodStreams,
  seriesCategories,
  series,
  epg,
};
