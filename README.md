# RE-FORGE PURGE

Stable Diffusion 모델 라이브러리 관리를 위한 프로젝트.
로컬에 저장된 모델 파일들의 상태를 확인하고, Civitai API와 연동하여 업데이트 상태를 파악하며 불필요한 파일을 정리하는 용도

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
