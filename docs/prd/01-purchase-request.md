# PRD 01 — Purchase Request (PR)

> **Status: DRAFT, para basahin at sagutin ni Zaf.**
> Una sa serye. Isang module bawat PRD, para walang makaligtaan.
>
> Paano basahin:
> - **Bahagi A** — ang system *ngayon*, ayon lang sa code (walang dagdag).
> - **Bahagi B** — mga problemang nakita sa code.
> - **Bahagi C** — ang *mungkahing* bagong daloy, batay sa sinabi mo: ang admin ay ang head
>   ng GSO, at ang staff ang nag-aasikaso at nag-a-approve. Wala ang Mayor at ang Budget
>   Office sa daloy ng system.
> - **Bahagi D** — mga tanong na ikaw lang ang makakasagot. Lagyan mo lang ng sagot sa ilalim.
>
> Petsa: 15 Oct 2026. Pinagbatayan: `src/features/purchase-requests/*`,
> `src/pages/purchase-requests/*`, `src/pages/portal/portal-request-page.tsx`,
> `src/features/portal/track.ts`, `src/features/shared/procurement-sheets.tsx`,
> `src/lib/officials.ts`, `supabase/migrations/012_notifications.sql`.

---

## A. Ang PR ngayon (mula sa code)

### A1. Saan ito ginagawa

| Saan | Sino | Daan |
|---|---|---|
| Portal (walang login) | Staff ng ibang opisina | `/portal/request` |
| Admin | GSO (naka-login) | `/purchase-requests/new` |

Iisa ang form ng dalawa (`pr-form.tsx`).

### A2. Ang laman ng isang PR

| Field | Sino ang naglalagay | Tala |
|---|---|---|
| PR number (hal. `PR-2026-000214`) | Auto | Galing sa Settings → Document Numbering |
| Requesting office | Requester | Dropdown ng 19 na office (code), o "Other office…" na tina-type |
| Requested by | Requester | Pangalan, tina-type |
| Purpose | Requester | Kahit 10 letra |
| Items | Requester | Bawat isa: description, qty, unit, estimated unit cost |
| Fund | Auto | Galing sa Settings → Procurement → Default Funding Source. Hindi tinatanong sa form. |
| Request date | Auto | Ang araw ng pag-file. Hindi tinatanong. |
| Attachments | — | Tinanggal sa form noong 15 Oct; nananatili ang mga luma |
| Comments, History, Approvals | System / GSO | Talaan ng mga nangyari |

### A3. Mga status ngayon at ang daloy

```
(file) → Submitted → Department Head Review → Budget Review → Approved → Completed
                     ↘ Return → Draft
```

- Kapag nag-file, **Submitted** agad (hindi dumadaan sa Draft).
- **Approve** ang iisang button. Isang hakbang ang usad bawat pindot:
  Submitted → Department Head Review → Budget Review → Approved → Completed.
  Ibig sabihin, apat na beses pinipindot ng GSO ang Approve para sa isang PR.
- **Return** — ibinabalik sa **Draft**, may tala na "Returned to requester for revision".
- May **Rejected** at **Cancelled** na status, pero **walang button** para sa kanila.
- Kapag **Approved**, lumalabas ang **Generate PO**, na nagbubukas ng bagong PO na galing sa PR.
- "Administrator" ang nakatala sa bawat aksyon, hindi ang totoong pangalan ng gumawa.

### A4. Ano ang nakikita ng requester (Track page)

Sa `/portal/track`, ito ang sinasabi kung nasaan ang PR:

| Status | "Now at" |
|---|---|
| Draft | Requesting Office |
| Submitted, Department Head Review | General Services Office |
| Budget Review | Municipal Budget Office |
| Approved | **Mayor's Office** |
| Completed, Rejected, Cancelled | General Services Office |

### A5. Mga screen sa admin

1. **Listahan** (`/purchase-requests`)
   - Status tabs na may bilang, search, at Office filter.
   - Columns: Request (purpose, PR no., requester), Office, Amount, Filed, Status.
   - Export (CSV) at "New purchase request".
   - Kapag pumili ng mga row: Export, **Print**, Delete.
2. **Drawer** (pinindot na row): detalye, items, at tabs na Timeline, Attachments, Comments,
   History. Mga button: Close, Print, Edit, Generate PO, Return, Approve.
3. **Full detail page** (`/purchase-requests/:id`, binubuksan mula sa Dashboard): pareho
   ang laman, pero **walang Approve at Return**.
4. **Create** at **Edit**: pareho ng form ng portal.

### A6. Ang printed PR

- Official na "PURCHASE REQUEST" sheet.
- Laman:
  - Department
  - Fund, PR No. at Date
  - Items (unit, description, qty, unit cost, total)
  - Grand total
- Blangko ang **Section** at **FPP**.
- Pirma: General Services Officer, Municipal Treasurer, Municipal Mayor. Nakasulat ang mga
  pangalan sa code (`src/lib/officials.ts`).
- **Hindi naka-print ang Purpose.**

### A7. Mga koneksyon

- **Notifications** (database trigger):
  - "New Purchase Request Submitted" kapag may nag-file
  - "Approved" kapag naging Approved
  - "Rejected" kapag naging Rejected
- **Dashboard:** "Purchase requests awaiting review" ang bilang ng Submitted, Department
  Head Review at Budget Review.
- **Sidebar:** pareho ang bilang.
- **PO:** may PR number ang PO. Pero hindi nagbabago ang status ng PR kapag ginawan ito ng
  PO, at walang pumipigil sa paggawa ng dalawang PO sa iisang PR.
- **Reports:** "Purchase Request Report".
- **Audit trail:** bawat create, update at delete.

---

## B. Mga problemang nakita (mula sa code)

1. **Mga hakbang na hindi kasali sa totoong proseso.** Dumadaan sa "Department Head Review"
   at "Budget Review", at sinasabi ng Track na nasa "Municipal Budget Office" o "Mayor's
   Office" ito. Hindi ito ang totoong daloy.
2. **Apat na pindot ng Approve** para matapos ang isang PR.
3. **Patay na Return.** Ibinabalik sa Draft, pero walang login ang requester, kaya hindi
   niya ito mabubuksan o maaayos. Nakatengga ang PR.
4. **Walang Reject o Cancel na button,** kahit may status para sa kanila.
5. **Dalawang detail view.** Ang drawer at ang full page ay magkaiba ang mga button, kaya
   hindi ma-approve ang PR mula sa Dashboard.
6. **Maraming button sa drawer** (6): Close, Print, Edit, Generate PO, Return, Approve.
7. **Ang "Print" sa bulk bar ay pini-print ang screen,** hindi ang mga PR.
8. **Edit at Delete kahit anong status,** kahit Approved o may PO na. Permanente ang Delete.
9. **"Administrator" lang ang nakatala** bilang gumawa, kaya hindi malalaman kung sinong staff
   ang nag-approve.
10. **Hindi naka-print ang Purpose** sa PR. Blangko rin ang Section at FPP.
11. **Hindi alam ng PR kung may PO na ito,** at pwedeng magkaroon ng dobleng PO.
12. **Walang paraan para malaman ng requester kung bakit ibinalik o tinanggihan** ang PR,
    maliban kung tatawagan sila.

---

## C. Mungkahing daloy (para i-approve mo)

### C1. Mga user

| User | Paano pumapasok | Ano ang kaya |
|---|---|---|
| **Requester** (ibang opisina) | Portal, walang login | Mag-file ng PR at i-track ito |
| **GSO Staff** | Admin login | Tingnan, i-edit bago i-approve, Approve, Return/Reject na may dahilan, gumawa ng PO |
| **GSO Head (Admin)** | Admin login | Lahat ng kaya ng staff, at Delete, Settings, at pamamahala ng users |

### C2. Mga status (mula 8, magiging 5)

```
(file) → For review → Approved → PO created
              ↘ Rejected (may dahilan)
              ↘ Cancelled (may dahilan)
```

| Status | Ibig sabihin | Sino ang gumagalaw |
|---|---|---|
| **For review** | Natanggap ng GSO, hinihintay ang aksyon | Auto pagka-file |
| **Approved** | Inaprubahan ng GSO staff o head. Iisang pindot. | GSO |
| **PO created** | May PO na. Kusa itong nagbabago kapag ginawa ang PO. | Auto |
| **Rejected** | Hindi itutuloy. Kita ng requester ang dahilan sa Track. | GSO |
| **Cancelled** | Binawi, hal. sa hiling ng requester. May dahilan. | GSO |

Tatanggalin: **Draft**, **Department Head Review**, **Budget Review**, at **Completed**
(papalitan ng "PO created").

**Ang "Return" ay magiging "Reject na may dahilan."** Hindi makakapag-edit ang requester, kaya
mag-fi-file na lang siya ulit ng bago, kita ang dahilan sa Track. Kung maliit lang ang mali
(hal. typo sa unit), ang GSO na mismo ang mag-e-Edit bago mag-Approve. *Tingnan ang tanong D2.*

### C3. Track page (para sa requester)

| Status | "Now at" | Ipapakita |
|---|---|---|
| For review | General Services Office | "Received. GSO is reviewing it." |
| Approved | General Services Office | "Approved. GSO is preparing the purchase order." |
| PO created | General Services Office | ang PO number |
| Rejected / Cancelled | — | ang dahilan, at "File a new request if needed." |

Wala nang Mayor's Office at Budget Office.

### C4. Mga screen

1. **Listahan.** Ganito pa rin, at ang tabs ay ang 5 status.
   - Tatanggalin ang "Print" sa bulk bar.
   - Ang Delete ay para sa Head lang.
2. **Iisang detail view (drawer).** Bubuksan ng Dashboard ang listahan, nakabukas na ang
   drawer. Tatanggalin ang hiwalay na full page, *o* ito ang gagamitin sa lahat (tanong D5).
3. **Mga button sa drawer, ayon sa status.** Iisa lang ang primary button bawat status:
   - **For review:** primary **Approve**. Nasa "⋯" menu ang Edit, Reject at Print.
   - **Approved:** primary **Create PO**. Nasa "⋯" ang Print at Cancel.
   - **PO created:** link papunta sa PO, at Print.
   - **Rejected / Cancelled:** Print lang.
4. **Create / Edit.** Pareho ng form ngayon. Hindi na pwedeng i-Edit kapag Approved na.

### C5. Form (walang babaguhin maliban kung sasabihin mo)

Office, Requested by, Purpose, at Items (description, qty, unit, unit cost). Auto ang Fund at
Date. *Tingnan ang D6 kung may kulang.*

### C6. Print

Susundin ang **official na PR form**. Kailangan ko ng scan o picture nito para tumugma
(tanong D7).
- Idadagdag ang **Purpose**.
- Ilalagay ang **Requested by**.
- Ang mga pirma (GSO, Treasurer, Mayor) ay mananatili sa papel kung kasama sila sa official
  form. **Pirma lang ito sa papel, hindi hakbang sa system.**

### C7. Talaan

- Itatala ang **totoong pangalan** ng staff na nag-Approve, Reject o Cancel.
- **Notifications:** "New PR" para sa GSO. Ang requester ay titingin sa Track, dahil wala
  siyang login.

---

## D. Mga tanong para sa iyo

Sagutin sa ilalim ng bawat isa, kahit isang salita lang.

**D1. Sino ang pwedeng mag-Approve ng PR?** Lahat ng GSO staff, o ang Head lang?
> Sagot:

**D2. Kapag may mali ang PR,** ano ang gusto mo?
(a) Reject na may dahilan, tapos mag-file ulit ang requester.
(b) Ang GSO ang mag-e-Edit.
(c) Pareho.
> Sagot:

**D3. Kapag Approved,** pareho bang tao ang gumagawa ng PO, o iba?
> Sagot:

**D4. Pwede bang magkaroon ng higit sa isang PO ang isang PR?** (hal. dalawang supplier)
> Sagot:

**D5. Detail view:** drawer sa gilid lang, o full page lang?
> Sagot:

**D6. May kulang ba sa form?** Hal. contact number ng requester, petsa kung kailan kailangan,
o section o division.
> Sagot:

**D7. Pakipadala ng picture ng official PR form** na ginagamit ngayon, para tumugma ang print.
> Sagot:

**D8. Kasama pa ba sa papel na PR ang pirma ng Treasurer at Mayor?**
> Sagot:

**D9. Delete:** dapat bang mabura ang PR? O "Cancelled" na lang lagi, para may talaan?
> Sagot:

**D10. Ang mga lumang PR** na nasa "Department Head Review" o "Budget Review": gagawin bang
"For review" lahat?
> Sagot:

---

*Susunod na PRD (pagkatapos masagot ito): 02 — Purchase Order.*
