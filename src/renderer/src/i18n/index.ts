// Đa ngôn ngữ. Mọi chữ hiển thị trên giao diện phải lấy qua t('khoa'),
// KHÔNG viết cứng tiếng Việt trong component – để sau này chỉ cần thêm file ngôn ngữ.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import vi from './vi.json'
import en from './en.json'

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en }
  },
  lng: 'vi', // ngôn ngữ mặc định
  fallbackLng: 'vi', // thiếu bản dịch thì dùng tiếng Việt
  interpolation: { escapeValue: false } // React đã tự chống XSS
})

export default i18n
