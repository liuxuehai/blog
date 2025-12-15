// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'Astro Blog';
export const SITE_DESCRIPTION = 'Welcome to my website!';

export const CATEGORIES = {
    'ai': {
        label: 'AI',
        subcategories: {
            'pytorch': 'Pytorch'
        }
    },
    'frontend': {
        label: '前端',
        subcategories: {
            'react': 'React',
            'shadcn': 'Shadcn'
        }
    },
    'backend': {
        label: '后端',
        subcategories: {
            'java': 'Java',
            'go': 'Go',
            'rust': 'Rust'
        }
    },
    'database': {
        label: '数据库',
        subcategories: {
            'mysql': 'MySQL',
            'redis': 'Redis',
            'postgres': 'Postgres'
        }
    },
    'server': {
        label: '服务器',
        subcategories: {
            'k8s': 'K8s'
        }
    },
    'others': {
        label: '其他',
        subcategories: {} // Others might not have subcategories defined as strictly
    }
};
