#!/usr/bin/env python3
"""
NMI + Clover ile Kart Doğrulama - Batch Mimarı
"""

import requests
import os
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# ================== KONFİGÜRASYON ==================
INPUT_FILE = "cards.txt"
OUTPUT_FILE = "live.txt"

# NMI Config
NMI_CONFIG = {
    "api_username": "bygreenllc",
    "api_password": "Ak1f1987@...",
    "security_key": "v4_secret_4A9387r9Kc44xHm3p2g2V28Qu9t3vb8X",
    "api_url": "https://api.nmi.com/api/v1/transaction"
}

# Clover Config
CLOVER_CONFIG = {
    "merchant_id": "YOUR_MERCHANT_ID",
    "public_token": "YOUR_PUBLIC_TOKEN",
    "private_token": "YOUR_PRIVATE_TOKEN",
    "api_url": "https://api.clover.com/v1/charges",
    "token_url": "https://token.clover.com/v1/tokens"
}

# Batch Ayarları
BATCH_SIZE = 10
PARALLEL_WORKERS = 5
DELAY_BETWEEN_BATCHES = 2
TIMEOUT = 20

# Proxy Listesi
proxies_list = [
    "http://akifdemi55574:llfg52end4@192.158.235.162:21250",
    "http://akifdemi55574:llfg52end4@160.202.94.136:21323",
    "http://akifdemi55574:llfg52end4@104.143.228.9:21320",
]

print_lock = Lock()
live_count = 0

def get_proxy(index):
    if not proxies_list:
        return None
    return {"https": proxies_list[index % len(proxies_list)]}

def verify_card_nmi(card_data, index):
    """NMI ile kart doğrulama"""
    xml_request = f'''<?xml version="1.0" encoding="utf-8"?>
<sale>
    <api-username>{NMI_CONFIG["api_username"]}</api-username>
    <api-password>{NMI_CONFIG["api_password"]}</api-password>
    <security-key>{NMI_CONFIG["security_key"]}</security-key>
    <type>verify</type>
    <cc-number>{card_data["pan"]}</cc-number>
    <cc-exp>{card_data["month"]}{card_data["year"][-2:]}</cc-exp>
    <cc-cvv>{card_data["cvv"]}</cc-cvv>
    <amount>0.00</amount>
    <currency>USD</currency>
</sale>'''
    
    headers = {"Content-Type": "application/xml"}
    proxy = get_proxy(index)
    
    try:
        response = requests.post(
            NMI_CONFIG["api_url"],
            data=xml_request,
            headers=headers,
            proxies=proxy,
            timeout=TIMEOUT
        )
        
        if response.status_code in [200, 201, 202]:
            root = ET.fromstring(response.text)
            result_code = root.findtext('result_code', '')
            result = root.findtext('result', '')
            is_live = result_code in ['100', '200'] or result.upper() in ['SUCCESS', 'APPROVED']
            
            return {
                "live": is_live,
                "gateway": "NMI",
                "result_code": result_code,
                "result_text": root.findtext('result_text', '')
            }
    except:
        pass
    
    return {"live": False, "gateway": "NMI", "error": "Failed"}

def verify_card_clover(card_data, index):
    """Clover ile kart doğrulama"""
    if not CLOVER_CONFIG["public_token"]:
        return {"live": False, "gateway": "Clover", "error": "Config missing"}
    
    proxy = get_proxy(index)
    
    try:
        # Tokenize
        token_payload = {
            "card": {
                "number": card_data["pan"],
                "exp_month": int(card_data["month"]),
                "exp_year": int(card_data["year"]),
                "cvv": card_data["cvv"]
            }
        }
        token_headers = {
            "Content-Type": "application/json",
            "apikey": CLOVER_CONFIG["public_token"]
        }
        
        token_resp = requests.post(
            CLOVER_CONFIG["token_url"],
            json=token_payload,
            headers=token_headers,
            proxies=proxy,
            timeout=10
        )
        
        if token_resp.status_code != 200:
            return {"live": False, "gateway": "Clover", "error": "Tokenization failed"}
        
        token_id = token_resp.json().get("id")
        if not token_id:
            return {"live": False, "gateway": "Clover", "error": "No token"}
        
        # Charge (0.50 test)
        charge_payload = {
            "amount": 50,
            "currency": "usd",
            "source": token_id,
            "capture": False
        }
        charge_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CLOVER_CONFIG['private_token']}"
        }
        
        charge_resp = requests.post(
            CLOVER_CONFIG["api_url"],
            json=charge_payload,
            headers=charge_headers,
            proxies=proxy,
            timeout=10
        )
        
        if charge_resp.status_code in [200, 201, 202]:
            charge_data = charge_resp.json()
            is_live = charge_data.get("status") in ["succeeded", "approved", "authorized"]
            return {
                "live": is_live,
                "gateway": "Clover",
                "transaction_id": charge_data.get("id")
            }
        
        return {"live": False, "gateway": "Clover", "error": "Charge failed"}
        
    except Exception as e:
        return {"live": False, "gateway": "Clover", "error": str(e)[:50]}

def check_single_card(card_line, index):
    """Tek kartı kontrol et (önce NMI, başarısızsa Clover)"""
    global live_count
    
    try:
        parts = card_line.strip().split('|')
        if len(parts) < 4:
            return
        
        pan = parts[0].strip()
        month = parts[1].strip().zfill(2)
        year = parts[2].strip()
        cvv = parts[3].strip()
        
        if len(year) == 2:
            year = f"20{year}"
        
        card_data = {"pan": pan, "month": month, "year": year, "cvv": cvv}
        
        # Önce NMI
        result = verify_card_nmi(card_data, index)
        
        # NMI başarısızsa Clover
        if not result.get("live"):
            result = verify_card_clover(card_data, index)
        
        if result.get("live"):
            with print_lock:
                live_count += 1
                live_line = f"{pan}|{month}|{year}|{cvv}|US|Unknown|UNKNOWN|UNKNOWN|0.00|{result.get('gateway', 'unknown')}"
                with open(OUTPUT_FILE, 'a') as f:
                    f.write(live_line + '\n')
                print(f"   ✅ [{index}] LIVE: {pan[:6]}****{pan[-4:]} | {result.get('gateway')}")
        else:
            error = result.get('error', '')
            print(f"   ❌ [{index}] DEAD: {pan[:6]}****{pan[-4:]} | {error[:30] if error else 'Declined'}")
            
    except Exception as e:
        print(f"   ❌ [{index}] Hata: {str(e)[:40]}")

def main():
    print("=" * 70)
    print("   🔥 NMI + CLOVER KART DOĞRULAMA 🔥")
    print("=" * 70)
    
    if not os.path.exists(INPUT_FILE):
        print(f"[!] {INPUT_FILE} bulunamadı!")
        return
    
    with open(INPUT_FILE, 'r') as f:
        cards = [line.strip() for line in f if line.strip()]
    
    total = len(cards)
    print(f"[+] {total} kart okundu")
    
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)
    
    # Batch'leri oluştur
    batches = [cards[i:i+BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]
    
    print(f"[+] Batch boyutu: {BATCH_SIZE}")
    print(f"[+] Toplam batch: {len(batches)}")
    print("=" * 70)
    
    start_time = time.time()
    
    for i, batch in enumerate(batches, 1):
        print(f"\n[Batch {i}/{len(batches)}] {len(batch)} kart işleniyor...")
        
        with ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as executor:
            futures = [executor.submit(check_single_card, card, idx) for idx, card in enumerate(batch, 1)]
            for future in as_completed(futures):
                try:
                    future.result()
                except:
                    pass
        
        if i < len(batches):
            print(f"   ⏳ {DELAY_BETWEEN_BATCHES} saniye bekleniyor...")
            time.sleep(DELAY_BETWEEN_BATCHES)
    
    elapsed = time.time() - start_time
    
    print("\n" + "=" * 70)
    print("[✓] İŞLEM TAMAMLANDI!")
    print(f"[✓] Süre: {elapsed:.1f} saniye")
    print(f"[✓] Toplam: {total} kart")
    print(f"[✓] Canlı: {live_count} kart")
    print(f"[✓] Kaydedildi: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
