const API_KEY = process.env.YOUTUBE_API_KEY;

async function fetchTrending(regionCode) {
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet` +
    `&chart=mostPopular` +
    `&regionCode=${regionCode}` +
    `&maxResults=20` +
    `&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  return data.items.map((item) => ({
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
  }));
}

export async function getTrends() {
  const [us, jp] = await Promise.all([
    fetchTrending("US").catch(() => []),
    fetchTrending("JP").catch(() => []),
  ]);

  return { us, jp };
}
