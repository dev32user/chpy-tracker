# CHPY ROC Tracker

YieldMax CHPY 페이지에서 분배 이력과 Estimated ROC를 수집하여 GitHub Pages에 정적 웹페이지로 공개하는 프로젝트입니다.

## 구조

- `src/update-history.ts`: YieldMax CHPY 페이지 크롤링 및 JSON 생성
- `docs/data/history.json`: 수집된 전체 이력
- `docs/index.html`: GitHub Pages 정적 페이지
- `.github/workflows/update-and-deploy.yml`: 자동 수집 + 커밋 + Pages 배포

## 로컬 실행

```bash
npm install
npm run update
```

실행 후:

```text
docs/data/history.json
```

이 갱신됩니다.

## GitHub Pages 설정

Repository → Settings → Pages에서:

- Source: `GitHub Actions`

를 선택합니다.

그 후 Actions 탭에서 `Update CHPY ROC History and Deploy`를 수동 실행하면 됩니다.

## 주의

- 데이터 출처: https://yieldmaxetfs.com/our-etfs/chpy/
- ROC는 YieldMax가 표시하는 estimated ROC이며 최종 세무상 분류와 다를 수 있습니다.
- YieldMax 웹페이지 구조가 변경되면 `src/update-history.ts`의 테이블 탐색 로직을 수정해야 할 수 있습니다.
