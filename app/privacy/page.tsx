import Link from "next/link"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-8 space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-6">
          <div className="w-10 h-10 rounded-full bg-[#4A1A6B] flex items-center justify-center text-white text-lg">⚖️</div>
          <div>
            <h1 className="text-xl font-bold text-[#4A1A6B]">นโยบายความเป็นส่วนตัว</h1>
            <p className="text-sm text-gray-400">ระบบการเรียนการสอนออนไลน์ · กรมการทหารสื่อสาร</p>
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800">1. ข้อมูลที่เก็บรวบรวม</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            ระบบเก็บรวบรวมข้อมูลส่วนบุคคล ได้แก่ เลขประจำตัวประชาชน เลขประจำตัวทหาร ชื่อ-นามสกุล
            ยศ หน่วยต้นสังกัด วันเดือนปีเกิด และข้อมูลผลการเรียน เพื่อใช้ในการจัดการศึกษาและออกใบประกาศนียบัตรภายในองค์กร
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800">2. วัตถุประสงค์การใช้ข้อมูล</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>การยืนยันตัวตนและเข้าสู่ระบบ</li>
            <li>การจัดการหลักสูตรและผลการเรียน</li>
            <li>การออกและติดตามใบประกาศนียบัตร</li>
            <li>การรายงานสถิติกำลังพลตามมาตรฐานที่กำหนด</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800">3. ฐานทางกฎหมาย</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            การประมวลผลข้อมูลอาศัยฐาน <strong>ภารกิจสาธารณะ</strong> และ <strong>สัญญาการปฏิบัติราชการ</strong>
            ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) มาตรา 24 (4) และ (5)
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800">4. ความปลอดภัยของข้อมูล</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            ข้อมูลระบุตัวตนทุกรายการถูกเข้ารหัสด้วย AES-256-GCM ก่อนบันทึกลงฐานข้อมูล
            การเข้าถึงข้อมูลจำกัดเฉพาะผู้ที่ได้รับอนุญาต และมีการบันทึก Audit Log ทุกการกระทำ
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800">5. สิทธิ์ของเจ้าของข้อมูล</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>สิทธิ์ขอเข้าถึงข้อมูลของตนเอง</li>
            <li>สิทธิ์ขอแก้ไขข้อมูลที่ไม่ถูกต้อง</li>
            <li>สิทธิ์ขอลบข้อมูลเมื่อพ้นสภาพราชการ</li>
          </ul>
          <p className="text-sm text-gray-600">
            ติดต่อใช้สิทธิ์ได้ที่ผู้ดูแลระบบ หรือฝ่ายบุคคลของหน่วย
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800">6. การเก็บรักษาข้อมูล</h2>
          <p className="text-sm text-gray-600">
            ข้อมูลจะถูกเก็บรักษาตลอดระยะเวลาปฏิบัติราชการ และลบออกภายใน 5 ปีหลังพ้นสภาพ เว้นแต่มีกฎหมายกำหนดเป็นอย่างอื่น
          </p>
        </section>

        <div className="border-t border-gray-100 pt-4 text-center">
          <Link href="/login" className="text-sm text-[#4A1A6B] hover:underline">
            ← กลับหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  )
}
