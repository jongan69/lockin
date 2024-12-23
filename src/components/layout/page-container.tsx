import React from "react";

export const PageContainer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <main className="min-h-screen bg-gradient-to-b from-base-100 to-base-200">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {children}
      </div>
    </main>
  );
};
