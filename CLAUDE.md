# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript library that provides transaction management for AdonisJS applications. The library implements automatic transaction handling through decorators and mixins.

## Architecture

The library consists of a single main file:

- `transactional.ts` - Contains the core transaction management functionality

### Key Components

1. **AsyncLocalStorage**: Uses Node.js AsyncLocalStorage to maintain transaction context across async operations
2. **@transaction() decorator**: Automatically wraps methods in database transactions
3. **Transactional mixin**: Extends Lucid models with automatic transaction support
4. **getCurrentTransaction()**: Utility function to access the current transaction context

### Transaction Flow

The library uses a nested transaction approach:
- If no transaction exists, creates a new one
- If a transaction already exists, reuses it (nested calls)
- Automatically commits on success or rolls back on error
- Compatible with AdonisJS Lucid ORM and SoftDeletes trait

## Development

This is an npm package for AdonisJS applications. 

### Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Watch mode compilation
- `npm run clean` - Remove build directory
- `npm test` - Run tests (placeholder)

### Project Structure

- `src/` - Source TypeScript files
- `build/` - Compiled JavaScript output (generated)
- `src/index.ts` - Main entry point that exports all public APIs
- `src/transactional.ts` - Core transaction implementation

## Usage Patterns

The library provides two main usage patterns:

1. **Decorator Pattern**: Apply `@transaction()` to service methods
2. **Mixin Pattern**: Extend models with `Transactional(BaseModel)` for automatic transaction handling

The mixin overrides common Lucid model methods (query, create, save, delete, etc.) to automatically use the current transaction context when available.