export const APP_URL = import.meta.env.PUBLIC_APP_URL || "https://blogstack-app.hidden-silence-2d18.workers.dev";
export const DOCS_URL = import.meta.env.PUBLIC_DOCS_URL || "https://blogstack-docs.hidden-silence-2d18.workers.dev";
export const DEMO_URL = import.meta.env.PUBLIC_DEMO_URL || "https://blogstack-blog.hidden-silence-2d18.workers.dev/blog";
export const SUPPORT_EMAIL = import.meta.env.PUBLIC_SUPPORT_EMAIL || "hello@boldlaunchstudio.com";
export const SIGNUP_OPEN = import.meta.env.PUBLIC_SIGNUP_OPEN === "true";
export const ACCESS_URL = SIGNUP_OPEN ? APP_URL + "/register" : "/early-access";
export const ACCESS_LABEL = SIGNUP_OPEN ? "Start free trial" : "Request early access";
