# allproduct

마스터 유통 거래처 상품 시세판 · B2B 상품 데이터 제출 폼

## 페이지

| 파일 | 역할 |
|---|---|
| `index.html` | 상품 시세판 — 창고별 공급가, 전일대비 인상/인하 표시 |
| `vendor.html` | 상품 등록 폼 — 창고/공급가 입력 → 실시간 카드 미리보기 → 표·TSV·JSON 내보내기 |
| `format.html` | 데이터 제출 형식 안내 (거래처 공급사용) |
| `data/products.json` | 실제 표시되는 상품 데이터 — 이 파일만 갈아끼우면 화면이 바뀝니다 (전체 취급 품목 647종) |

## 현재 데이터

`data/products.json`은 유통시트 전체(창고 19곳 · 상품 647종)를 그대로 옮긴 것입니다.
사진은 로컬에 저장하지 않고 회사 CDN(masterc.co.kr) 원본 URL을 그대로 참조합니다 — 화면에서는
`images.weserv.nl` 리사이즈 프록시를 거쳐 작게 표시됩니다(원본 catalog.html과 동일한 방식).

## 데이터 갱신

`data/products.json`을 편집하거나 `vendor.html`에서 만든 JSON으로 교체 후 커밋·푸시하면
GitHub Pages가 자동 반영합니다 (보통 1~2분). 서비스계정·인증키를 쓰지 않는 정적 사이트라
공개 레포에 안전하게 올릴 수 있습니다.

필드 정의는 `format.html` 참조.

## GitHub Pages 설정 (최초 1회)

레포 **Settings → Pages → Source: `Deploy from a branch`**, Branch를 `main` / `(root)`로
지정하면 아래 주소로 열립니다.

```
https://wonbi.github.io/allproduct/
```
