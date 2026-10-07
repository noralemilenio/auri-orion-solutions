#!/usr/bin/env python3
import argparse
import json
import sqlite3
import time
from pathlib import Path

DB=Path("checkpoints.sqlite3")
ARTIFACT=Path("demo-artifact.txt")

def connect():
    db=sqlite3.connect(DB)
    db.execute("""CREATE TABLE IF NOT EXISTS steps(
        run_id TEXT NOT NULL,
        step TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        output TEXT,
        PRIMARY KEY(run_id,step)
    )""")
    return db

def checkpoint(db,run_id,step):
    return db.execute(
        "SELECT status,attempts,output FROM steps WHERE run_id=? AND step=?",
        (run_id,step)
    ).fetchone()

def execute_step(db,run_id,step,fn,max_attempts=3):
    saved=checkpoint(db,run_id,step)
    if saved and saved[0]=="done":
        print(f"[reuse] {step}: {saved[2]}")
        return saved[2]

    attempts=(saved[1] if saved else 0)+1
    if attempts>max_attempts:
        raise RuntimeError(f"{step}: reintentos agotados")

    db.execute("""INSERT INTO steps(run_id,step,status,attempts,output)
                  VALUES(?,?,?,?,NULL)
                  ON CONFLICT(run_id,step)
                  DO UPDATE SET status='running',attempts=excluded.attempts""",
               (run_id,step,"running",attempts))
    db.commit()

    try:
        output=fn(attempts)
        rendered=json.dumps(output,ensure_ascii=False)
        db.execute(
            "UPDATE steps SET status='done',output=? WHERE run_id=? AND step=?",
            (rendered,run_id,step)
        )
        db.commit()
        print(f"[done] {step}: {rendered}")
        return rendered
    except Exception:
        db.execute(
            "UPDATE steps SET status='failed' WHERE run_id=? AND step=?",
            (run_id,step)
        )
        db.commit()
        raise

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--run-id",default="demo-001")
    ap.add_argument("--fail-once",action="store_true")
    args=ap.parse_args()
    db=connect()

    execute_step(db,args.run_id,"prepare",
                 lambda n:{"prepared":True,"at":int(time.time())})

    def create_artifact(attempt):
        if args.fail_once and attempt==1:
            raise RuntimeError("fallo temporal simulado")
        if not ARTIFACT.exists():
            ARTIFACT.write_text("resultado creado una sola vez\n",encoding="utf-8")
        return {"artifact":str(ARTIFACT),"exists":True}

    execute_step(db,args.run_id,"create_artifact",create_artifact)
    execute_step(db,args.run_id,"finalize",
                 lambda n:{"status":"complete"})

if __name__=="__main__":
    main()
