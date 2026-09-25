import Link from "next/link"

export const metadata = {
  title: "ข้อกำหนดการใช้งาน | ระบบมาตรฐานความรู้ เหล่าทหารสื่อสาร",
  description:
    "ข้อกำหนดและเงื่อนไขการใช้งานระบบมาตรฐานความรู้ เหล่าทหารสื่อสาร กรมการทหารสื่อสาร กองทัพบก",
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="space-y-2">{children}</section>
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-8 space-y-6">
        {/* หัวเรื่อง */}
        <div className="flex items-start gap-3 border-b border-gray-100 pb-6">
          <div className="w-11 h-11 rounded-full bg-[#4A1A6B] flex items-center justify-center text-white text-lg shrink-0">
            📜
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-[#4A1A6B]">
              ข้อกำหนดการใช้งาน (Terms of Use)
            </h1>
            <p className="text-sm text-gray-500">
              ระบบมาตรฐานความรู้ เหล่าทหารสื่อสาร · กรมการทหารสื่อสาร กองทัพบก
            </p>
            <p className="text-xs text-gray-400">
              ฉบับที่ 1 · มีผลบังคับใช้ 17 สิงหาคม 2569
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed">
          ข้อกำหนดนี้เป็นเงื่อนไขการใช้งานระบบมาตรฐานความรู้ เหล่าทหารสื่อสาร
          (signalstandard.rta.mi.th) ซึ่งเป็นระบบราชการของกรมการทหารสื่อสาร กองทัพบก
          การเข้าใช้งานระบบถือว่าผู้ใช้ได้อ่านและยอมรับข้อกำหนดนี้แล้ว
        </p>

        <Card>
          <h2 className="font-semibold text-gray-800">1. การยอมรับข้อกำหนด</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            การลงทะเบียนหรือเข้าสู่ระบบถือเป็นการยอมรับข้อกำหนดฉบับนี้และ
            <Link href="/privacy" className="text-[#4A1A6B] hover:underline">
              {" "}ประกาศความเป็นส่วนตัว
            </Link>{" "}
            หากไม่ยอมรับ โปรดยุติการใช้งานระบบ
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-800">2. คุณสมบัติและสิทธิการเข้าใช้งาน</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>ระบบนี้สงวนไว้สำหรับกำลังพลและเจ้าหน้าที่ที่ได้รับอนุญาตจากหน่วยเท่านั้น</li>
            <li>ผู้ใช้ต้องเข้าใช้งานด้วยบัญชีที่หน่วยกำหนดให้ตามตัวบุคคลจริง</li>
            <li>ห้ามผู้ที่ไม่ได้รับอนุญาตเข้าใช้งานระบบไม่ว่ากรณีใด</li>
          </ul>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-800">3. บัญชีผู้ใช้และการรักษาความปลอดภัย</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>ผู้ใช้ต้องรักษารหัสผ่านเป็นความลับ และรับผิดชอบต่อการกระทำภายใต้บัญชีของตน</li>
            <li>ห้ามใช้บัญชีร่วมกัน ยืม หรือมอบบัญชีให้ผู้อื่นใช้แทน</li>
            <li>ต้องแจ้งผู้ดูแลระบบทันทีเมื่อพบการเข้าถึงบัญชีโดยไม่ได้รับอนุญาต</li>
          </ul>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-800">4. ข้อปฏิบัติและข้อห้ามในการใช้งาน</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>ห้ามทุจริตในการสอบ คัดลอกข้อสอบ หรือกระทำการใดที่บิดเบือนผลการประเมิน</li>
            <li>ห้ามเข้าถึง แก้ไข หรือทำลายข้อมูลของผู้อื่นโดยไม่มีสิทธิ</li>
            <li>ห้ามใช้เครื่องมืออัตโนมัติ เจาะระบบ หรือรบกวนการทำงานของระบบ</li>
            <li>ห้ามนำเนื้อหา ข้อสอบ หรือข้อมูลในระบบไปเผยแพร่โดยไม่ได้รับอนุญาต</li>
          </ul>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-800">5. ทรัพย์สินทางปัญญาและชั้นความลับ</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            เนื้อหาหลักสูตร ข้อสอบ เอกสาร และสื่อการเรียนทั้งหมดเป็นลิขสิทธิ์และทรัพย์สินของ
            กรมการทหารสื่อสาร กองทัพบก ข้อมูลบางส่วนอาจมีชั้นความลับตามระเบียบว่าด้วยการรักษา
            ความลับของทางราชการ ผู้ใช้ต้องไม่ทำซ้ำ เผยแพร่ หรือนำออกนอกระบบโดยไม่ได้รับอนุญาต
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-800">6. ความถูกต้องของผลการสอบและใบประกาศนียบัตร</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            ผลการสอบ เกรด และใบประกาศนียบัตรที่ระบบออกให้ถือเป็นหลักฐานทางราชการ
            ผู้ใช้ต้องไม่แก้ไข ปลอมแปลง หรือทำให้ข้อมูลดังกล่าวคลาดเคลื่อนจากความเป็นจริง
            การกระทำที่ฝ่าฝืนอาจมีความผิดทางวินัยและทางกฎหมาย
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-800">7. การระงับและยกเลิกสิทธิการใช้งาน</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            หน่วยงานสงวนสิทธิ์ในการระงับหรือยกเลิกบัญชีผู้ใช้ที่ฝ่าฝืนข้อกำหนดนี้
            หรือเมื่อผู้ใช้พ้นสภาพการปฏิบัติราชการ โดยไม่จำเป็นต้องแจ้งล่วงหน้า
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-800">8. ข้อจำกัดความรับผิด</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            หน่วยงานจะดูแลระบบให้ใช้งานได้อย่างต่อเนื่องตามสมควร แต่ไม่รับผิดต่อความเสียหาย
            อันเกิดจากเหตุสุดวิสัย การหยุดให้บริการเพื่อบำรุงรักษา หรือการใช้งานที่ผิดข้อกำหนด
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-800">9. กฎหมายที่ใช้บังคับ</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย ระเบียบของทางราชการ และวินัยทหาร
            การใช้งานระบบต้องเป็นไปตามคำสั่งของผู้บังคับบัญชาและระเบียบที่เกี่ยวข้อง
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-800">10. การเปลี่ยนแปลงข้อกำหนด</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            หน่วยงานอาจปรับปรุงข้อกำหนดนี้เป็นครั้งคราว โดยจะเผยแพร่ฉบับปรับปรุงบนระบบ
            และให้ถือวันที่มีผลบังคับใช้ตามที่ระบุไว้ด้านบน
          </p>
        </Card>

        <div className="border-t border-gray-100 pt-4 flex items-center justify-between text-sm">
          <Link href="/login" className="text-[#4A1A6B] hover:underline">
            ← กลับหน้าเข้าสู่ระบบ
          </Link>
          <Link href="/privacy" className="text-[#4A1A6B] hover:underline">
            ประกาศความเป็นส่วนตัว →
          </Link>
        </div>
      </div>
    </div>
  )
}
