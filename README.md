# RE-FORGE PURGE

Stable Diffusion 모델 라이브러리 관리를 위한 데스크톱 애플리케이션입니다. 로컬에 저장된 모델 파일들의 상태를 확인하고, Civitai API와 연동하여 업데이트 상태를 파악하며 불필요한 파일을 정리할 수 있습니다.

## 주요 기능

- 모델 파일 스캔: .safetensors, .ckpt 확장자 모델의 빠른 탐색 및 목록화.
- 카테고리 분류: 모델이 저장된 하위 폴더명을 기준으로 자동 그룹화.
- Civitai 연동: 각 모델의 최신 릴리즈 날짜 및 현재 버전의 최신 여부 확인.
- 파일 정리: 설정한 기간 이상 업데이트되지 않은 모델 판별 및 관련 파일(.png, .json, .info) 일괄 삭제.
- 실시간 통계: 선택한 모델들의 합계 용량 계산 및 디스크 확보 가능량 표시.

## 기술 스택

### 프론트엔드
- React 19 (TypeScript)
- Tailwind CSS 4.0
- Lucide React (Icons)
- date-fns

### 백엔드
- Rust
- Tauri 2.0 Framework (Core)
- WalkDir (Filesystem)

## 실행 및 빌드

### 요구 사항
- Node.js (v18+)
- Rust (Cargo)

### 개발 모드 실행
```bash
npm install
npm run tauri dev
```

### 실행 파일 빌드
```bash
npm run tauri build
```
빌드된 파일은 `src-tauri/target/release` 경로에서 확인할 수 있습니다.

## 라이선스
MIT License
