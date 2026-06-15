"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/client-error-reporting";

type Props = {
  children: React.ReactNode;
  title?: string;
};

type State = { hasError: boolean; error?: Error | null; key: number };

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, key: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Section error:", error, info);
    reportClientError({
      message: error.message || "Section error",
      name: error.name || "Error",
      stack: error.stack || null,
      componentStack: info.componentStack || null,
      level: "error",
    });
  }

  retry = () => {
    this.setState((s) => ({ hasError: false, error: null, key: s.key + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-[#0f172a]">
              {this.props.title || "Section failed to load"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {this.state.error?.message || "Unexpected error."}
            </p>
            <div className="mt-4">
              <Button onClick={this.retry} className="rounded-lg">Retry</Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return <div key={this.state.key}>{this.props.children}</div>;
  }
}

export default ErrorBoundary;
