export async function GET() {
  const params = new URLSearchParams({
    applicationId: process.env.RAKUTEN_APP_ID,
    keyword: 'コードレス掃除機',
    hits: '3',
  });
  const url = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?' + params;
  const res = await fetch(url);
  const data = await res.json();
  return Response.json({
    error: data.error ?? 'なし',
    count: data.count ?? 0,
    appIdLength: (process.env.RAKUTEN_APP_ID || '').length,
    appIdFirst10: (process.env.RAKUTEN_APP_ID || '').slice(0, 10),
  });
}
