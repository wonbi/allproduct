# allproduct

마스터 유통 거래처 상품 카탈로그 · B2B 상품 데이터 제출 폼

## 페이지

| 파일 | 역할 |
|---|---|
| `index.html` | **제안용 카탈로그** — 공급가는 "별도 문의"로 가려짐. 신규 거래 제안 시 이 링크를 보냅니다 |
| `partners.html` | **거래처용 카탈로그** — 공급가가 항상 그대로 보임. 이미 거래 중인 업체에게만 이 링크를 보냅니다 |
| `vendor.html` | 상품 등록 폼 — 창고/공급가 입력 → 실시간 카드 미리보기 → 표·TSV·JSON 내보내기 |
| `format.html` | 데이터 제출 형식 안내 (거래처 공급사용) |
| `data/products.json` | 실제 표시되는 상품 데이터 — 두 카탈로그가 공유합니다. 이 파일만 갈아끼우면 양쪽 다 바뀝니다 (전체 취급 품목 647종) |

`index.html`과 `partners.html`은 같은 `data/products.json`을 읽는 완전히 동일한 화면(검색·정렬·
창고 필터·모바일 카드 전부 동일)이고, **공급가를 보여주는지 여부만 다릅니다.** 가격을 수정하면
(관리자 모드에서 내보낸 JSON으로 `data/products.json`을 갈아끼우면) 두 페이지 다 자동 반영됩니다.

⚠️ `wonbi/allproduct`는 **공개(public) 레포**입니다. `partners.html`을 `index.html`에서 링크하지
않아 겉으로는 안 보이지만, 레포 파일 목록이나 URL을 직접 보면 누구나 접근할 수 있습니다 —
"모르면 못 보는" 수준의 구분이지 접근 자체를 막는 건 아닙니다. 정말 막아야 하면 레포를
private으로 돌려야 하는데, 그러면 GitHub Pages를 쓰려면 유료 플랜이 필요합니다.

## 현재 데이터

`data/products.json`은 유통시트 전체(창고 19곳 · 상품 647종)를 그대로 옮긴 것입니다.
사진은 로컬에 저장하지 않고 회사 CDN(masterc.co.kr) 원본 URL을 그대로 참조합니다 — 화면에서는
`images.weserv.nl` 리사이즈 프록시를 거쳐 작게 표시됩니다(원본 catalog.html과 동일한 방식).

## 관리자 모드 (index.html 전용)

`index.html`은 기본으로 공급가가 "별도 문의"로 가려집니다. 하단의 **관리자** 링크를
눌러 비밀번호를 입력하면(현재 비밀번호는 담당자에게 문의) 실제 공급가가 보이고, 가격을
클릭해서 바로 수정할 수 있습니다. 수정한 내역은 우측 하단 **변경사항 내보내기** 버튼으로
`products.json`을 새로 받아 `data/products.json`에 덮어쓰면 반영됩니다 (index.html·
partners.html 둘 다 이 파일을 읽으므로 자동으로 같이 바뀝니다). `partners.html`은 가격이
항상 보이는 화면이라 별도의 관리자 기능이 없습니다.

⚠️ 서버 없는 정적 사이트라 "로그인"은 브라우저 안에서 비밀번호 해시(SHA-256)를 비교하는
방식입니다 — 일반 방문자가 가격을 못 보게 가리는 용도로는 충분하지만, 소스를 볼 수 있는
사람까지 막는 진짜 보안은 아닙니다.

## 데이터 갱신

`data/products.json`을 편집하거나 `vendor.html`에서 만든 JSON으로 교체 후 커밋·푸시하면
GitHub Pages가 자동 반영합니다 (보통 1~2분). 서비스계정·인증키를 쓰지 않는 정적 사이트라
공개 레포에 안전하게 올릴 수 있습니다.

필드 정의는 `format.html` 참조.

### 유통시트 자동 동기화

`scripts/sync-catalog.js`가 유통시트(baljuseo/catalog.html이 쓰는 것과 같은 시트)를 다시 읽어
`data/products.json`을 통째로 새로 씁니다. **매일 한 번 자동으로 실행**되도록 예약되어 있고,
화면 상단에 "마지막 동기화 YYYY-MM-DD HH:MM" 형식(한국시간)으로 표시됩니다.

```
node scripts/sync-catalog.js
```

이 스크립트는 인증키를 직접 갖고 있지 않습니다 — 실행할 때마다 `chanwha0221-cmyk/baljuseo`
(공개 레포)의 `catalog.html`에서 읽기전용 서비스계정 정보를 그 자리에서 읽어 쓰고 버립니다.
받아온 상품이 400개 미만이면(시트 구조가 바뀌었거나 오류) 실패 처리하고 기존
`data/products.json`을 그대로 둡니다 — 절반만 받아온 데이터로 사이트를 깨뜨리지 않기 위함입니다.

⚠️ **자동 동기화와 관리자 수동 수정은 같이 쓸 수 없습니다.** 동기화가 돌면 시트 내용으로
`data/products.json`을 통째로 덮어쓰기 때문에, index.html 관리자 모드에서 고친 가격이 있어도
다음 동기화 때 시트 값으로 되돌아갑니다. 특정 가격을 사이트에서만 다르게 유지하고 싶다면
시트 자체를 고쳐야 합니다.

## GitHub Pages 설정 (최초 1회)

레포 **Settings → Pages → Source: `Deploy from a branch`**, Branch를 `main` / `(root)`로
지정하면 아래 주소로 열립니다.

```
https://wonbi.github.io/allproduct/
```
