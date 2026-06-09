# AI Development Rules for Bingo App

This document provides guidelines for the AI assistant to follow when developing and modifying this application. The goal is to maintain code quality, consistency, and adherence to the established architecture.

## 1. Core Technology Stack

The application is built on a modern, type-safe, and efficient stack. Please adhere to these technologies:

-   **Framework**: [React](https://react.dev/) for building the user interface.
-   **Build Tool**: [Vite](https://vitejs.dev/) for fast development and optimized builds.
-   **Language**: [TypeScript](https://www.typescriptlang.org/) for static typing and improved code quality.
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/) for all utility-first styling.
-   **UI Components**: [shadcn/ui](https://ui.shadcn.com/) provides the core component library, built upon Radix UI.
-   **Routing**: [React Router](https://reactrouter.com/) for all client-side navigation and routing.
-   **Global State**: React Context API (`GameContext`) for managing shared application state related to the game.
-   **Icons**: [Lucide React](https://lucide.dev/) for a consistent and clean set of icons.
-   **Forms**: [React Hook Form](https://react-hook-form.com/) for form state management, paired with [Zod](https://zod.dev/) for schema validation.

## 2. Library Usage and Coding Rules

To ensure consistency, please follow these specific rules when implementing new features or making changes.

### UI and Components

-   **Primary Component Library**: ALWAYS use components from the `shadcn/ui` library (`src/components/ui`) for all standard UI elements like buttons, inputs, dialogs, etc.
-   **Custom Components**: If a specific component is not available in `shadcn/ui`, create a new, reusable component inside `src/components/`. Style it using Tailwind CSS utility classes.
-   **Styling**: Do NOT write custom CSS files. All styling MUST be done with Tailwind CSS. Use the `cn` utility function from `src/lib/utils.ts` to conditionally apply classes.

### State Management

-   **Component State**: Use React's `useState` and `useReducer` hooks for state that is local to a single component.
-   **Global Game State**: All state related to matches, players, and game logic MUST be managed within the `GameContext` (`src/contexts/GameContext.tsx`).
-   **Server State**: For any asynchronous operations like fetching data from an API, use `@tanstack/react-query`.

### Routing and Navigation

-   **Page Creation**: New pages must be created as components within the `src/pages/` directory.
-   **Route Definition**: All routes must be defined in `src/App.tsx` using the `<BrowserRouter>` and `<Routes>` components from `react-router-dom`.

### Icons

-   **Icon Source**: Only use icons from the `lucide-react` package. Do not install or use other icon libraries.

### Forms

-   **Form Logic**: Use `react-hook-form` to manage form state, validation, and submissions.
-   **Validation**: Define form schemas and validation rules using `zod`.

### File Structure

-   Adhere strictly to the existing file structure:
    -   `src/pages/`: For top-level page components.
    -   `src/components/`: For reusable, application-specific components.
    -   `src/components/ui/`: For `shadcn/ui` base components.
    -   `src/contexts/`: For React Context providers.
    -   `src/hooks/`: For custom React hooks.
    -   `src/types/`: For TypeScript type definitions.
    -   `src/utils/`: For shared utility functions.

By following these rules, we can ensure the application remains clean, consistent, and easy to maintain.