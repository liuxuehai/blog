import zhCN from '../i18n/zh-CN.json';
import en from '../i18n/en.json';

export const locales = {
    'zh-CN': '简体中文',
    'en': 'English'
};

export const defaultLocale = 'zh-CN';

const translations = {
    'zh-CN': zhCN,
    'en': en
};

export function useTranslations(Astro: any) {
    const pathname = Astro.url.pathname;
    const locale = pathname.startsWith('/en/') || pathname === '/en' ? 'en' : defaultLocale;

    function t(key: string): string {
        const keys = key.split('.');
        let result: any = translations[locale as keyof typeof translations];

        for (const k of keys) {
            if (result && typeof result === 'object' && k in result) {
                result = result[k];
            } else {
                // Fallback to default locale
                let fallback = translations[defaultLocale];
                for (const fk of keys) {
                    if (fallback && typeof fallback === 'object' && fk in fallback) {
                        fallback = fallback[fk];
                    } else {
                        return key;
                    }
                }
                return fallback as string;
            }
        }

        return result as string;
    }

    function getLocaleUrl(path: string) {
        // Remove existing locale prefix if present
        let cleanPath = path;
        Object.keys(locales).forEach(loc => {
            if (path.startsWith(`/${loc}/`) || path === `/${loc}`) {
                cleanPath = path.replace(`/${loc}`, '') || '/';
            }
        });

        if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.substring(1);
        }

        if (locale === defaultLocale) {
            return `/${cleanPath}`;
        }
        return `/${locale}/${cleanPath}`;
    }

    return { t, locale, getLocaleUrl };
}
