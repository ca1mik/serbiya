# Informativna ponuda: OtpremaOps za dobavljače javnog sektora

**Datum:** 28.09.2026.  
**Za:** [Naziv potencijalnog klijenta]  
**Od:** [Naziv, PIB i kontakt vaše firme]  
**Važenje predloga:** do 28.10.2026.

## Manje ručnog prepisivanja, jasniji tok otpremnica

Ako otpremnice nastaju u ERP-u, Excelu ili više poslovnih sistema, priprema dokumenta za eOtpremnica često znači proveru šifarnika, podataka o kupcu, artikala i rokova. OtpremaOps je operativni sloj koji učitava CSV/XLSX, prikazuje otpreme kojima nedostaju podaci, vodi evidenciju ispravki i daje timu pregled statusa i odgovornosti.

Posebno je namenjen dobavljačima zdravstvenih ustanova i drugim firmama sa većim brojem otprema ka javnom sektoru. Obaveza slanja u tom scenariju primenjuje se od 01.01.2026. prema [informacijama Ministarstva finansija](https://eotpremnica.efaktura.gov.rs/tekst/6563/najcesce-postavljena-pitanja.php).

## Predlog saradnje

**Korak 1 — procena procesa, bez naknade (30–45 minuta).** Zajedno prolazimo kroz tipičnu otpremu, broj dokumenata mesečno, postojeći softver i uzorak izvoza bez osetljivih podataka. Nakon razgovora dobijate kratku procenu da li dodatni operativni sloj ima smisla u vašem slučaju.

**Korak 2 — ograničen radni pilot, bez naknade (do 14 dana).** Za jednu organizaciju i jedan format CSV/XLSX podešavamo mapiranje, prikazujemo red za ispravke i merimo vreme od izvoza do pripremljenog dokumenta. U pilotu se koristi demonstraciono okruženje i samo testni ili anonimizovani podaci. Trenutna verzija OtpremaOps koristi simulaciju odgovora (`DEMO / MOCK`); **ne šalje dokumenta državnom sistemu i ne zamenjuje vaš važeći postupak slanja**. Po završetku dobijate nalaz: koje podatke nedostaju, koliki je ručni rad i koji delovi integracije su potrebni.

**Korak 3 — produkciono uvođenje, samo posle posebne tehničke provere i ugovora.** Plan obuhvata prilagođavanje stvarnom izvozu, zvanični UBL/XML, povezivanje sa državnim demo i produkcionim API-jem, obradu odgovora i statusa, korisničku obuku i podršku. Ponudu za ovaj korak potvrđujemo tek nakon uspešnih testova na državnom demo-okruženju i utvrđenog obima. Danas ga ne predstavljamo kao dostupnu funkciju.

## Orijentacioni komercijalni model za korak 3

| Stavka | Predložena cena, bez PDV-a | Napomena |
| --- | ---: | --- |
| Analiza i pilot (koraci 1–2) | 0 RSD | Bez obaveze kupovine. |
| Jednokratno uvođenje | od 120.000 RSD | Jedna firma, jedan izvor podataka, standardni proces; konačna cena posle uvida u primer izvoza. |
| Operativna pretplata | od 14.900 RSD mesečno | Do 1.000 otprema mesečno, uz dogovoreni nivo podrške; konačna specifikacija i SLA u ugovoru. |

Navedene cene su **predlog za razgovor**, a ne obavezujuća ponuda za danas nedostupnu produkcionu funkciju. Za manji obim dokumenata državni portal ili postojeći ERP mogu biti ekonomičniji. Cilj je da korist merimo na vašim podacima pre odluke.

## Kako merimo uspeh

Pre pilota beležimo mesečni broj otprema, prosečno vreme pripreme i tipične greške. Pilot uspeva ako tim dobije pregled izuzetaka, pouzdano uveze dogovoreni format i može da pokaže merljivo smanjenje ručnog rada. Pre produkcije obavezni su provera zvanične šeme, test državnog demo-API-ja, scenariji odbijanja i ponovnog pokušaja, zaštita pristupa i prihvatanje od strane vašeg tima.

**Sledeći korak:** odgovorite sa približnim brojem otprema mesečno, nazivom sistema iz kog izvozite podatke i kontaktom osobe koja vodi proces otpreme. Predložićemo termin za kratku procenu.

[Ime i prezime]  
[Funkcija, firma]  
[Poslovni e-mail i telefon]
