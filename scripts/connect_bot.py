#!/usr/bin/env python3
"""Safe one-time Telegram BotFather token setup via GitHub Actions Secrets."""
from __future__ import annotations
import getpass, json, re, subprocess, sys

REPO="tradeain8n/mtt-exchange-miniapp"
EXPECTED_BOT_ID="8456005459"
WORKFLOW="configure-bot.yml"

def run(args, payload=None, timeout=35):
    return subprocess.run(args,input=None if payload is None else payload.encode(),
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,check=False)

def main():
    if not sys.stdin.isatty():
        raise RuntimeError("Запустите в интерактивном Termux, не через pipe")
    print("MTT Exchange — подключение Telegram Mini App")
    print("1. В @BotFather перевыпустите прежний токен бота командой /revoke.")
    print("2. Вставьте НОВЫЙ токен ниже. Ввод скрыт; в истории команд его не будет.")
    check=run(["gh","api",f"repos/{REPO}"])
    if check.returncode or not json.loads(check.stdout).get("private") is False:
        raise RuntimeError("Не удалось подтвердить GitHub-репозиторий; проверьте gh auth status")
    new_token=getpass.getpass("Новый токен бота (ввод скрыт): ").strip()
    if not re.fullmatch(r"[0-9]{8,15}:[A-Za-z0-9_-]{20,}",new_token):
        raise RuntimeError("Некорректный формат токена")
    if not new_token.startswith(EXPECTED_BOT_ID+":"):
        raise RuntimeError("Токен другого бота — операция остановлена")
    answer=input("Сохранить токен только в GitHub Actions Secrets и настроить меню? Введите ДА: ").strip()
    if answer.casefold()!="да":
        print("Отменено. Токен не загружен.")
        return
    cmd=run(["gh","secret","set","TELEGRAM_BOT_TOKEN","-R",REPO],payload=new_token,timeout=60)
    new_token=""  # Never log or persist.
    if cmd.returncode: raise RuntimeError("Не получилось сохранить GitHub Secret")
    print("✓ Секрет настроен. Запуск GitHub Actions...")
    result=run(["gh","workflow","run",WORKFLOW,"-R",REPO],timeout=35)
    if result.returncode: raise RuntimeError("Workflow не запущен; откройте GitHub Actions")
    print("✓ Запуск создан:",result.stdout.decode().strip())
    print("Проверьте результат в GitHub Actions и откройте Telegram-бота.")
if __name__=="__main__":
    try:main()
    except (RuntimeError,subprocess.TimeoutExpired) as e:
        print("Ошибка:",str(e),file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nОтменено")
        sys.exit(130)
