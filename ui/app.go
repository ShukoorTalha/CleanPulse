package main

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"os"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func getMolePath() string {
	// For production: the mole script must be packed or resolved absolutely
	// For this dev environment, we assume the parent directory has the mole script
	pwd, _ := os.Getwd()
	// Fallback to searching up from the current directory
	p := filepath.Clean(filepath.Join(pwd, "..", "mole"))
	if _, err := os.Stat(p); err == nil {
		return p
	}
	
	// If run from within Contents/MacOS format in mac `.app` bundles
	p = filepath.Clean(filepath.Join(pwd, "..", "..", "..", "..", "..", "mole"))
	return p
}

// GetStatus returns the system status as a JSON string
func (a *App) GetStatus() (string, error) {
	moleCmd := getMolePath()
	cmd := exec.Command(moleCmd, "status", "--json")
	cmd.Dir = filepath.Dir(moleCmd)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get status: %w", err)
	}
	return string(out), nil
}

// AnalyzeDisk returns the disk analysis as a JSON string
func (a *App) AnalyzeDisk(path string) (string, error) {
	if path == "" {
		path = "/"
	}
	moleCmd := getMolePath()
	cmd := exec.Command(moleCmd, "analyze", "--json", path)
	cmd.Dir = filepath.Dir(moleCmd)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to analyze disk: %w", err)
	}
	return string(out), nil
}

// RunAction executes a generic mole action (clean, optimize, etc)
func (a *App) RunAction(action string) (string, error) {
	moleCmd := getMolePath()
	cmd := exec.Command(moleCmd, action)
	cmd.Dir = filepath.Dir(moleCmd)
	
	// Create a pipe for the output to stream to frontend
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return "", err
	}

	// Read output in chunks and emit to frontend
	buf := make([]byte, 1024)
	var fullOutput string
	for {
		n, err := stdout.Read(buf)
		if n > 0 {
			chunk := string(buf[:n])
			fullOutput += chunk
			runtime.EventsEmit(a.ctx, "log", chunk)
		}
		if err != nil {
			break
		}
	}

	if err := cmd.Wait(); err != nil {
		return fullOutput, fmt.Errorf("command failed: %w", err)
	}

	return fullOutput, nil
}
