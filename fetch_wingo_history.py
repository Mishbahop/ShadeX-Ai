import argparse
import json
import time
import urllib.request


def fetch_history(lottery, game, force_ts=None, user_agent='Mozilla/5.0'):
    ts = force_ts if force_ts is not None else int(time.time() * 1000)
    url = f"https://draw.ar-lottery06.com/{lottery}/{game}/GetHistoryIssuePage.json?ts={ts}"
    headers = {'User-Agent': user_agent}
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as resp:
        return json.load(resp)


def main():
    parser = argparse.ArgumentParser(description='Fetch WinGo history from draw.ar-lottery06.com')
    parser.add_argument('--lottery', default='WinGo', help='Lottery code (default: WinGo)')
    parser.add_argument('--game', default='WinGo_30S', help='Game code (default: WinGo_30S)')
    parser.add_argument('--out', default='wingo_history.json', help='Output file path')
    parser.add_argument('--limit', type=int, default=0, help='Limit entries in output (0 = all)')
    args = parser.parse_args()

    payload = fetch_history(args.lottery, args.game)
    entries = payload.get('data', {}).get('list', [])
    if args.limit > 0:
        entries = entries[:args.limit]
    output = {
        'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'lottery': args.lottery,
        'game': args.game,
        'code': payload.get('code'),
        'msg': payload.get('msg'),
        'serviceTime': payload.get('serviceTime'),
        'entries': entries,
    }
    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(output, fh, ensure_ascii=False, indent=2)
    print(f"Wrote {len(entries)} entries to {args.out}")


if __name__ == '__main__':
    main()
