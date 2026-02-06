# backend/main.py
# ─────────────────────────────────────────────────────────────
# FastAPI 엔트리
# - /api 하위에 sub-app 마운트 (✅ 통일)
# - 모든 라우터는 /api 하위에만 연결(혼용 금지)
# - Startup: DB 연결 확인 + 테이블 생성
# ─────────────────────────────────────────────────────────────
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 상대 임포트 유지
from .Login.routers import router as auth_router
from .Option.routers import router as option_router
from .Modifyoption.routers import router as checklist_router
from .EquipmentInfo.routers import router as equipment_router
from .MainDashboard.routers import router as dashboard_router
from .ProgressChecklist.routers import router as progress_router
from .EquipmentMoving.routers import router as move_router
from .troubleshoot.routers import router as troubleshoot_router
from .setup.routers import router as setup_router
from .board_post.routers import router as board_post_router
from .Main_main.routers import router as main_router
from .LogBrowser.routers import router as log_browser_router
from .LogChart.routers import router as log_chart_router
from .Calender.routers import router as calendar_router
from .LineAccessCurrent.routers import router as line_access_router
from .setup.routers import router as setup_router, equip_router as equip_progress_router
from .DefectCatalog.routers import router as defect_catalog_router

from .Attendance_history.routers import router as attendance_history_router
from .account.routers import router as account_router


from .deps import engine

# 로그인/공용 Base 둘 다 커버
from .Login.models import Base as LoginBase
from .db.database import Base as DBBase

# metadata 등록 보장용 임포트
from .Login import models as _login_models         # noqa: F401
from .Option import models as _option_models       # noqa: F401
from .MainDashboard import models as _dash_models  # noqa: F401
from .Calender import models as _calendar_models

log = logging.getLogger("uvicorn.error")

app = FastAPI(title="lineproject API")

# ─────────────────────────────────────────────
# CORS 설정
# - 프론트: http://192.168.101.1:3000
# - 개발용: localhost:3000 / 127.0.0.1:3000
# - allow_credentials=True 인 상태에서는 "*" 쓰면 안 됨
# ─────────────────────────────────────────────
origins = [
    "http://192.168.101.1:3000",  # 인트라넷 프론트
    "http://localhost:3000",      # 로컬 개발용
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,   # ← "*" 제거!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ /api 하위에 sub-app 마운트
api = FastAPI(title="lineproject API (sub)")
app.mount("/api", api)

# ✅ 모든 라우터는 /api 하위에만 연결 (혼용 금지)
api.include_router(auth_router)        # /api/auth/...
api.include_router(option_router)      # /api/task-options ...
api.include_router(checklist_router)   # /api/...
api.include_router(dashboard_router)   # /api/dashboard/...
api.include_router(equipment_router)   # /api/equipment/...
api.include_router(progress_router)    # /api/progress/...
api.include_router(move_router)        # /api/move/...
api.include_router(troubleshoot_router)
api.include_router(setup_router)
api.include_router(board_post_router)
api.include_router(main_router)
api.include_router(log_browser_router)
api.include_router(log_chart_router)
api.include_router(calendar_router)
api.include_router(attendance_history_router)
api.include_router(line_access_router)
api.include_router(account_router)
api.include_router(equip_progress_router)
api.include_router(defect_catalog_router)

@app.get("/health")
def health():
  return {"ok": True}


@app.on_event("startup")
def on_startup() -> None:
    try:
        # DB 연결 확인
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")

        # 테이블 생성(이미 있으면 패스)
        LoginBase.metadata.create_all(bind=engine)
        DBBase.metadata.create_all(bind=engine)

        log.info("✅ Startup OK: DB connected and tables checked.")
    except Exception:
        log.exception("❌ Startup failed (DB/init). Check DATABASE_URL & Postgres status.")
        raise
